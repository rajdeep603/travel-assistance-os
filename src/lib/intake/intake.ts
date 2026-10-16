import type { DocumentKind, InboundMessage, Prisma } from "@prisma/client";
import { BRAND } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { runAI } from "@/lib/services/ai";
import { checkCompleteness, reviewClaim } from "@/lib/services/claims";
import { processDocument } from "@/lib/services/document-extraction";
import { emailAddress } from "@/lib/services/email";
import { reviewBillForDocument } from "@/lib/services/bill-review-service";
import { draftFromCostEstimate } from "@/lib/services/guarantee-letter";
import { sendEmail } from "@/lib/services/outbox";
import { processingErrorMessage, sniffType, storeUpload } from "@/lib/uploads";
import { MATCH_THRESHOLD, matchCase, type CaseCandidate } from "./case-matching";
import { LANGUAGE_NAMES, detectLanguage, languageCode } from "./language";
import { intakeSummary } from "./summary";

// ---------------------------------------------------------------------------
// Intake automation for inbound e-mail and fax:
//   store → read every attachment (OCR for scans) → classify + extract →
//   detect language and risk → match the case → attach to the claim (or open
//   one) → auto-reply in the sender's language when it's safe, otherwise
//   queue for a human with a drafted reply.
// Cost estimates from hospitals start the Letter of Guarantee flow.
// ---------------------------------------------------------------------------

export interface InboundFile {
  filename: string;
  buffer: Buffer;
}

export interface InboundInput {
  channel: "EMAIL" | "FAX";
  externalId?: string | null;
  from: string;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  files: InboundFile[];
}

const CLAIM_KINDS: DocumentKind[] = ["MEDICAL_REPORT", "HOSPITAL_INVOICE", "DISCHARGE_SUMMARY", "PRESCRIPTION"];
const MAX_ATTACHMENTS = 10;
const MAX_BYTES = 15 * 1024 * 1024;

const RISK_RULES: [string, RegExp][] = [
  ["Complaint or legal threat", /\b(lawyer|legal action|solicitor|attorney|sue|court|ombudsman|formal complaint|avukat|şikayet|dava)\b/i],
  ["Possible medical emergency", /\b(chest pain|can't breathe|cannot breathe|unconscious|not breathing|bleeding heavily|stroke|seizure|suicid|emergency|acil|göğüs ağrısı)\b/i],
  ["Fraud indicator", /\b(change (my|the) bank|new bank details|different account|iban change)\b/i],
];

/** Stores an inbound message and its attachments; processing is separate. */
export async function receiveInbound(input: InboundInput): Promise<InboundMessage> {
  if (input.externalId) {
    const dup = await prisma.inboundMessage.findUnique({ where: { externalId: input.externalId } });
    if (dup) return dup;
  }
  if (input.files.length > MAX_ATTACHMENTS) throw new ApiError("Too many attachments.", 413, "TOO_LARGE");
  const message = await withRef("message", (ref) =>
    prisma.inboundMessage.create({
      data: {
        ref,
        channel: input.channel,
        externalId: input.externalId ?? null,
        fromAddress: input.from.slice(0, 300),
        toAddress: input.to?.slice(0, 300) ?? null,
        subject: input.subject?.slice(0, 500) ?? null,
        bodyText: input.body?.slice(0, 20000) ?? null,
      },
    })
  );
  for (const file of input.files) {
    const mimeType = sniffType(file.buffer);
    const ok = mimeType === "application/pdf" || mimeType === "text/plain";
    await prisma.document.create({
      data: {
        filename: file.filename.slice(0, 200),
        mimeType: mimeType ?? "application/octet-stream",
        sizeBytes: file.buffer.length,
        status: ok && file.buffer.length <= MAX_BYTES ? "UPLOADED" : "FAILED",
        error: ok ? (file.buffer.length > MAX_BYTES ? "Attachment too large." : null) : "Only PDF and plain-text attachments are processed.",
        storagePath: ok ? await storeUpload(file.filename, file.buffer) : null,
        source: input.channel,
        inboundMessageId: message.id,
      },
    });
  }
  return message;
}

function fileBuffers(files: InboundFile[]): Map<string, Buffer> {
  return new Map(files.map((f) => [f.filename.slice(0, 200), f.buffer]));
}

/** Runs the intake pipeline for a stored message. Never throws. */
export async function processInbound(messageId: string, files: InboundFile[]): Promise<InboundMessage> {
  const buffers = fileBuffers(files);
  await prisma.inboundMessage.update({ where: { id: messageId }, data: { status: "PROCESSING", error: null } });
  try {
    const message = await prisma.inboundMessage.findUniqueOrThrow({ where: { id: messageId }, include: { documents: true } });

    // 1. Read every attachment (text layer or OCR), classify and extract.
    const notes: string[] = []; // problems a person should see
    const actions: string[] = []; // what the automation did
    for (const doc of message.documents) {
      const buffer = buffers.get(doc.filename);
      if (doc.status !== "UPLOADED" || !buffer) continue;
      try {
        await processDocument(doc.id, buffer);
      } catch (err) {
        notes.push(`"${doc.filename}": ${processingErrorMessage(err)}`);
      }
    }
    const docs = await prisma.document.findMany({ where: { inboundMessageId: messageId }, include: { extraction: true } });
    const processed = docs.filter((d) => d.status === "PROCESSED");

    // 2. Language and risk.
    const bodyText = [message.subject, message.bodyText].filter(Boolean).join("\n");
    const language = detectLanguage(bodyText || processed[0]?.textContent || "");
    const allText = [bodyText, ...processed.map((d) => d.textContent ?? "")].join("\n");
    // Risk comes from what the sender wrote, not from attached clinical
    // documents (a medical report routinely says "emergency department").
    const riskFlags = RISK_RULES.filter(([, re]) => re.test(bodyText)).map(([label]) => label);

    // 3. Case match.
    const fromAddress = message.channel === "EMAIL" ? emailAddress(message.fromAddress) : null;
    const candidates = await matchCase({
      text: allText,
      fromAddress,
      people: processed.map((d) => ({
        patientName: d.extraction?.patientName ?? null,
        dateOfBirth: d.extraction?.dateOfBirth ?? null,
        policyReference: d.extraction?.policyReference ?? null,
        hospital: d.extraction?.hospital ?? null,
      })),
    });
    const best: CaseCandidate | undefined = candidates[0];
    const matched = best && best.score >= MATCH_THRESHOLD ? best : null;
    if (!matched) riskFlags.push(best ? "Low-confidence case match" : "No matching case");

    // 4. File documents on the case; claim documents from travellers go to their claim.
    let claimRef: string | null = null;
    let claimId: string | null = null;
    const fromTraveller = Boolean(
      matched && fromAddress && (await prisma.patient.findFirst({ where: { id: matched.patientId, email: { equals: fromAddress, mode: "insensitive" } } }))
    );
    if (matched) {
      await prisma.document.updateMany({
        where: { inboundMessageId: messageId },
        data: { caseId: matched.caseId, patientId: matched.patientId },
      });
      const claimDocs = processed.filter((d) => CLAIM_KINDS.includes(d.kind));
      if (claimDocs.length && (fromTraveller || matched.claimId)) {
        claimId =
          matched.claimId ??
          (
            await prisma.claim.findFirst({
              where: { caseId: matched.caseId, status: { in: ["SUBMITTED", "PROCESSING", "NEEDS_REVIEW", "INFO_REQUESTED"] } },
              orderBy: { createdAt: "desc" },
            })
          )?.id ??
          (
            await withRef("claim", (ref) =>
              prisma.claim.create({
                data: {
                  ref,
                  status: "PROCESSING",
                  patientId: matched.patientId,
                  caseId: matched.caseId,
                  history: [{ at: new Date().toISOString(), action: `Claim opened from ${message.channel.toLowerCase()} ${message.ref}`, note: null }],
                },
              })
            )
          ).id;
        await prisma.document.updateMany({ where: { id: { in: claimDocs.map((d) => d.id) } }, data: { claimId } });
        const reviewed = await reviewClaim(claimId);
        claimRef = reviewed.ref;
      }
      // Bill review: hospital invoices billed straight to us (direct billing) and claim invoices alike.
      for (const invoice of processed.filter((d) => d.kind === "HOSPITAL_INVOICE")) {
        try {
          const review = await reviewBillForDocument(invoice.id);
          if (review && Number(review.savings) > 0) {
            actions.push(`Bill review found ${Number(review.savings).toLocaleString("en-GB", { minimumFractionDigits: 2 })} ${review.currency} above the reference tariff`);
          }
        } catch (err) {
          notes.push(`Invoice "${invoice.filename}" could not be reviewed: ${processingErrorMessage(err)}`);
        }
      }
      for (const estimate of processed.filter((d) => d.kind === "COST_ESTIMATE")) {
        try {
          const letter = await draftFromCostEstimate(estimate.id, matched.caseId);
          actions.push(
            letter.status === "DRAFT"
              ? `Letter of Guarantee ${letter.ref} drafted for review`
              : `Letter of Guarantee ${letter.ref} ${letter.status.toLowerCase()}${letter.sentVia ? ` by ${letter.sentVia.toLowerCase()}` : ""}`
          );
        } catch (err) {
          notes.push(`Cost estimate "${estimate.filename}" needs a manual Letter of Guarantee: ${processingErrorMessage(err)}`);
        }
      }
    }

    // 5. Summary and case timeline.
    const kinds = processed.map((d) => d.kind.replace(/_/g, " ").toLowerCase());
    const summary = intakeSummary({
      channel: message.channel === "EMAIL" ? "EMAIL" : "FAX",
      from: message.fromAddress,
      caseRef: matched?.caseRef ?? null,
      kinds,
      claimRef: claimRef ?? null,
      language,
      actions,
    });
    if (matched) {
      await prisma.caseEvent.create({
        data: {
          caseId: matched.caseId,
          type: message.channel === "EMAIL" ? "EMAIL" : "FAX",
          title: `${message.channel === "EMAIL" ? "E-mail" : "Fax"} ${message.ref} received${message.subject ? `: ${message.subject}` : ""}`,
          body: summary,
          data: { messageRef: message.ref, documents: processed.map((d) => d.filename), riskFlags } as Prisma.InputJsonValue,
          actor: "agent:intake",
        },
      });
    }

    // 6. Reply: automatic when it's a confident traveller e-mail with no risk; else drafted for review.
    let status: InboundMessage["status"] = matched ? "MATCHED" : "NEEDS_REVIEW";
    if (message.channel === "EMAIL" && matched && fromTraveller) {
      const draft = await draftReply(matched, claimId, processed.map((d) => d.filename), language);
      if (riskFlags.length === 0) {
        await sendEmail({
          to: message.fromAddress,
          subject: `Re: ${message.subject ?? "your message"}`,
          text: draft,
          caseId: matched.caseId,
          inReplyToId: message.id,
          automatic: true,
          threadId: message.externalId ?? undefined,
        });
        status = "REPLIED";
      } else {
        await prisma.outboundMessage.create({
          data: {
            channel: "EMAIL",
            toAddress: message.fromAddress,
            subject: `Re: ${message.subject ?? "your message"}`,
            body: draft,
            status: "QUEUED",
            automatic: false,
            caseId: matched.caseId,
            inReplyToId: message.id,
          },
        });
        status = "NEEDS_REVIEW";
      }
    } else if (riskFlags.length) {
      status = "NEEDS_REVIEW";
    }

    return prisma.inboundMessage.update({
      where: { id: messageId },
      data: {
        status,
        language,
        riskFlags,
        summary,
        error: notes.length ? notes.join(" ") : null,
        matchedCaseId: matched?.caseId ?? null,
        matchConfidence: best?.score ?? null,
        matchReasons: candidates.slice(0, 3) as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error(`[intake] processing ${messageId} failed:`, err);
    return prisma.inboundMessage.update({
      where: { id: messageId },
      data: { status: "FAILED", error: processingErrorMessage(err) },
    });
  }
}

/** The acknowledgement: templated facts (never invented), in the traveller's language. */
async function draftReply(match: CaseCandidate, claimId: string | null, filenames: string[], messageLanguage: string): Promise<string> {
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: match.patientId } });
  const claim = claimId
    ? await prisma.claim.findUnique({ where: { id: claimId }, include: { patient: true, documents: { include: { extraction: true } } } })
    : null;
  const missing = claim ? checkCompleteness(claim).filter((i) => i.severity === "error").map((i) => i.message) : [];
  const lines = [
    `Dear ${patient.firstName} ${patient.lastName},`,
    "",
    "Thank you for your message — we have received it" + (filenames.length ? ` with ${filenames.length === 1 ? "1 document" : `${filenames.length} documents`}: ${filenames.join(", ")}.` : "."),
    claim ? `Your claim ${claim.ref} is now ${claim.status.replace(/_/g, " ").toLowerCase()}.` : "",
    missing.length
      ? `To complete it we still need: ${missing.join("; ")}. You can simply reply to this e-mail with the documents.`
      : claim
        ? "All required documents are on file; a claims handler will review the claim shortly."
        : "",
    `Your case reference is ${match.caseRef}.`,
    "",
    "Kind regards,",
    `Claims team — ${BRAND.name} (demonstration platform; all data is fictional)`,
  ].filter((l, i, all) => l !== "" || all[i - 1] !== "");
  const english = lines.join("\n");

  // Reply in the traveller's language: their profile language, or the language they wrote in.
  const target = patient.language && patient.language !== "English" ? languageCode(patient.language) : messageLanguage;
  if (target === "en" || !LANGUAGE_NAMES[target]) return english;
  const translated = await runAI("translateText", (ai) => ai.translateText(english, LANGUAGE_NAMES[target]));
  // Offline glossary can't translate this template; keep English rather than send a marked-up draft.
  return translated.value.startsWith("[") ? english : `${translated.value}\n\n— English —\n${english}`;
}
