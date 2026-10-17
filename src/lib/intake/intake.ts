import type { DocumentKind, InboundMessage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { runAI } from "@/lib/services/ai";
import { reviewClaim } from "@/lib/services/claims";
import { processDocument } from "@/lib/services/document-extraction";
import { emailAddress } from "@/lib/services/email";
import { reviewBillForDocument } from "@/lib/services/bill-review-service";
import { draftFromCostEstimate, letterPdf } from "@/lib/services/guarantee-letter";
import { sendEmail } from "@/lib/services/outbox";
import { utcToZoned } from "@/lib/time";
import { processingErrorMessage, sniffType, storeUpload } from "@/lib/uploads";
import { MATCH_THRESHOLD, matchCase, type CaseCandidate } from "./case-matching";
import { LANGUAGE_NAMES, detectLanguage, languageCode } from "./language";
import { guaranteeEnquiryReply, missingItem, travellerReply, type MissingItem, type TravellerFacts } from "./replies";
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

/** A hospital asking whether a guarantee of payment was issued (no documents attached). */
const GUARANTEE_ENQUIRY = /\b(guarantee|GOP|LOG-\d+|letter of guarantee|garanti|provizyon|ödeme taahh|Kostenübernahme|garantía de pago)/i;

const domainOf = (address: string | null | undefined) => (address ?? "").toLowerCase().split("@")[1]?.replace(/>$/, "") ?? "";

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
    } else if (message.channel === "EMAIL" && matched && processed.length === 0 && GUARANTEE_ENQUIRY.test(bodyText)) {
      // A hospital asking about its guarantee: answered at once when it writes
      // from the domain of the hospital the letter was issued to.
      const replied = riskFlags.length === 0 ? await answerGuaranteeEnquiry(message, matched, fromAddress, language) : false;
      status = replied ? "REPLIED" : "NEEDS_REVIEW";
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

/** Everything the traveller's reply may say about their case, from the records. */
async function travellerFacts(match: CaseCandidate, claimId: string | null, filenames: string[]): Promise<TravellerFacts> {
  const kase = await prisma.case.findUniqueOrThrow({
    where: { id: match.caseId },
    include: {
      patient: true,
      appointments: { where: { status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { gte: new Date() } }, orderBy: { scheduledAt: "asc" }, take: 1, include: { provider: true } },
      guaranteeLetters: { orderBy: { createdAt: "desc" }, take: 1 },
      transportPlans: { orderBy: { createdAt: "desc" }, take: 1 },
      claims: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
    },
  });
  const claim = await prisma.claim.findUnique({ where: { id: claimId ?? kase.claims[0]?.id ?? "" } });
  // What the claims team recorded as still needed (reviewClaim keeps it current).
  const issues = (Array.isArray(claim?.issues) ? claim.issues : []) as { severity?: string; message?: string }[];
  const missing = [...new Set(issues.filter((i) => i.severity === "error").map((i) => missingItem(i.message ?? "")))].filter((m): m is MissingItem => m != null);
  const apt = kase.appointments[0];
  const slot = apt ? utcToZoned(apt.scheduledAt) : null;
  return {
    name: `${kase.patient.firstName} ${kase.patient.lastName}`,
    documents: filenames,
    caseRef: kase.ref,
    caseStatus: kase.status,
    appointment: apt && slot ? { date: slot.date, time: slot.time, doctor: apt.provider.name, facility: apt.provider.facility } : null,
    guarantee: kase.guaranteeLetters[0] ? { hospital: kase.guaranteeLetters[0].hospitalName, status: kase.guaranteeLetters[0].status } : null,
    transport: kase.transportPlans[0]?.mode ?? null,
    claim: claim
      ? { ref: claim.ref, status: claim.status, missing, complete: issues.length > 0 && issues.every((i) => i.severity === "ok") }
      : null,
  };
}

/**
 * The reply: the case's actual state, in templated sentences (never invented),
 * in the traveller's language. The phrasebook covers the main languages
 * offline; others are translated when the live model is on, else English.
 */
async function draftReply(match: CaseCandidate, claimId: string | null, filenames: string[], messageLanguage: string): Promise<string> {
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: match.patientId } });
  const facts = await travellerFacts(match, claimId, filenames);
  const english = travellerReply(facts, "en").text;
  // Reply in the traveller's language: their profile language, or the language they wrote in.
  const target = patient.language && patient.language !== "English" ? languageCode(patient.language) : messageLanguage;
  if (target === "en") return english;
  const local = travellerReply(facts, target);
  if (local.language === target) return `${local.text}\n\n— English —\n${english}`;
  if (!LANGUAGE_NAMES[target]) return english;
  const translated = await runAI("translateText", (ai) => ai.translateText(english, LANGUAGE_NAMES[target]));
  // Offline glossary can't translate this template; keep English rather than send a marked-up draft.
  return translated.value.startsWith("[") ? english : `${translated.value}\n\n— English —\n${english}`;
}

/** Replies to a hospital's guarantee enquiry with the letter's status, attaching the letter. */
async function answerGuaranteeEnquiry(message: InboundMessage, match: CaseCandidate, fromAddress: string | null, language: string): Promise<boolean> {
  const kase = await prisma.case.findUniqueOrThrow({
    where: { id: match.caseId },
    include: { patient: true, guaranteeLetters: { orderBy: { createdAt: "desc" }, take: 1, include: { provider: true } } },
  });
  const letter = kase.guaranteeLetters[0] ?? null;
  // Only to the hospital the letter was issued to (same e-mail domain as on file).
  const domain = domainOf(fromAddress);
  if (!letter || !domain || domain !== domainOf(letter.provider?.email)) return false;
  const reply = guaranteeEnquiryReply(
    {
      patient: `${kase.patient.firstName} ${kase.patient.lastName}`,
      dateOfBirth: kase.patient.dateOfBirth.toISOString().slice(0, 10),
      caseRef: kase.ref,
      letter: {
        ref: letter.ref,
        status: letter.status,
        amount: Number(letter.guaranteedAmount),
        currency: letter.currency,
        excess: Number(letter.excess),
        validUntil: letter.validUntil.toISOString().slice(0, 10),
        sentVia: letter.sentVia === "EMAIL" ? "EMAIL" : letter.sentVia === "FAX" ? "FAX" : null,
        sentAt: letter.sentAt?.toISOString() ?? null,
        acknowledgedAt: letter.acknowledgedAt?.toISOString() ?? null,
      },
    },
    language
  );
  const pdf = reply.attachLetter ? await letterPdf(letter.id).catch(() => null) : null;
  await sendEmail({
    to: message.fromAddress,
    subject: `Re: ${message.subject ?? letter.ref}`,
    text: reply.text,
    attachments: pdf ? [{ filename: pdf.filename, content: pdf.content, type: "application/pdf" }] : undefined,
    attachmentDocumentId: pdf?.documentId,
    caseId: kase.id,
    inReplyToId: message.id,
    automatic: true,
    threadId: message.externalId ?? undefined,
  });
  await prisma.caseEvent.create({
    data: {
      caseId: kase.id,
      type: "LETTER_OF_GUARANTEE",
      title: `Answered ${letter.hospitalName}'s guarantee enquiry ${message.ref}${pdf ? `, with ${letter.ref} attached` : ""}`,
      body: reply.text.split("\n").slice(2, 5).join(" "),
      actor: "agent:intake",
    },
  });
  return true;
}
