import type { GuaranteeLetter, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, badRequest, conflict, notFound } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { addDays, zonedToday } from "@/lib/time";
import { storeUpload } from "@/lib/uploads";
import { round2 } from "@/lib/fx";
import { reviewBillForDocument, reviewResult } from "./bill-review-service";
import { committedGuarantees, convert } from "./exposure";
import { notifyFamily } from "./family-updates";
import { decideGuarantee } from "./guarantee-decision";
import { letterLanguageFor, renderGuaranteeLetter } from "./guarantee-pdf";
import { sendEmail, sendFax } from "./outbox";
import type { Benefit } from "./policy";
import { emit } from "./webhooks";

// ---------------------------------------------------------------------------
// Letters of Guarantee: a hospital's cost estimate comes in (upload, e-mail
// or fax) → the rules decide what can be guaranteed against the policy → the
// letter is generated → approved automatically when nothing needs a human,
// otherwise by an operator → sent back by fax (or e-mail) → the hospital's
// receipt is confirmed (optionally by an AI phone call).
// ---------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function findProvider(hospital: string | null, caseId: string, sender: string | null) {
  // The sender identifies the hospital best: its fax number or e-mail address.
  if (sender) {
    const digits = sender.replace(/[^\d]/g, "");
    const email = (sender.match(/<([^>]+)>/)?.[1] ?? sender).toLowerCase();
    const all = await prisma.provider.findMany({ where: { mergedIntoId: null } });
    const bySender = all.find(
      (p) => (digits.length >= 8 && p.phone.replace(/[^\d]/g, "") === digits) || p.email.toLowerCase() === email
    );
    if (bySender) return bySender;
  }
  if (hospital) {
    const all = await prisma.provider.findMany({ where: { mergedIntoId: null } });
    const h = norm(hospital);
    const hit = all.find((p) => norm(p.facility) === h) ?? all.find((p) => h.includes(norm(p.facility)) || norm(p.facility).includes(h));
    if (hit) return hit;
  }
  const apt = await prisma.appointment.findFirst({ where: { caseId }, orderBy: { scheduledAt: "desc" }, include: { provider: true } });
  return apt?.provider ?? null;
}

const actorOf = (by: string) => (by.startsWith("system") || by.startsWith("agent:") ? by : `operator:${by}`);

/** Drafts (and, when nothing needs a human, approves and sends) a letter for a cost estimate. */
export async function draftFromCostEstimate(
  documentId: string,
  caseId: string,
  opts: { autoSend?: boolean } = {}
): Promise<GuaranteeLetter> {
  const existing = await prisma.guaranteeLetter.findFirst({ where: { estimateDocumentId: documentId } });
  if (existing) return existing;

  const doc = await prisma.document.findUnique({ where: { id: documentId }, include: { extraction: true, inboundMessage: true } });
  if (!doc) throw notFound("Cost estimate");
  const ex = doc.extraction;
  if (!ex || ex.invoiceAmount == null || !ex.currency) {
    throw badRequest("The cost estimate has no readable total amount and currency.");
  }
  const currency = ex.currency.toUpperCase();
  const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, include: { patient: { include: { policy: true } } } });
  const provider = await findProvider(ex.hospital, caseId, doc.inboundMessage?.fromAddress ?? null);
  const policy = kase.patient.policy;
  // Bill review of the estimate: advice on price, but never-covered lines come off.
  if (!doc.caseId) await prisma.document.update({ where: { id: documentId }, data: { caseId, patientId: kase.patientId } });
  const reviewed = await reviewBillForDocument(documentId);
  const review = reviewed ? reviewResult(reviewed) : null;
  const committed = policy ? (await committedGuarantees(kase.patientId, policy.currency)).total : 0;

  const decision = decideGuarantee({
    country: kase.country,
    estimate: {
      amount: Number(ex.invoiceAmount),
      currency,
      diagnosis: ex.diagnosis,
      treatment: ex.procedures,
      admissionDate: ex.admissionDate,
      review: review ? { notCovered: review.notCovered, recommended: review.recommended, ruleset: review.ruleset } : null,
    },
    policy: policy
      ? {
          number: policy.number,
          plan: policy.plan,
          validFrom: policy.validFrom,
          validTo: policy.validTo,
          currency: policy.currency,
          medicalLimit: Number(policy.medicalLimit),
          medicalUsed: Number(policy.medicalUsed),
          committed,
          benefits: policy.benefits as unknown as Benefit[],
        }
      : null,
    autoApproveLimitEur: env.logAutoApproveLimitEur,
    on: new Date(),
  });

  const letter = await withRef("guarantee", (ref) =>
    prisma.guaranteeLetter.create({
      data: {
        ref,
        caseId,
        providerId: provider?.id ?? null,
        hospitalName: provider?.facility ?? ex.hospital ?? "Treating hospital",
        estimateDocumentId: documentId,
        estimatedAmount: Number(ex.invoiceAmount),
        currency,
        guaranteedAmount: decision.guaranteedAmount,
        excess: decision.excess,
        conditions: decision.conditions,
        flags: decision.flags,
        validUntil: new Date(`${addDays(zonedToday(), env.logValidDays)}T21:00:00Z`),
        status: "DRAFT",
        decisionTrace: decision.trace as Prisma.InputJsonValue,
      },
    })
  );
  await prisma.caseEvent.create({
    data: {
      caseId,
      type: "LETTER_OF_GUARANTEE",
      title: `${letter.ref} drafted from the cost estimate (${Number(ex.invoiceAmount).toLocaleString("en-GB")} ${letter.currency})`,
      body: decision.autoApprove
        ? `Guarantee of ${decision.guaranteedAmount.toLocaleString("en-GB")} ${letter.currency} is within policy and the automatic approval limit.`
        : `Needs a human decision: ${decision.flags.join("; ")}.`,
      actor: "agent:guarantee",
    },
  });
  // Link the review to the letter that answers it.
  if (reviewed) await reviewBillForDocument(documentId);

  if (decision.autoApprove) {
    const approved = await approveLetter(letter.id, "system:auto-approval");
    return opts.autoSend === false ? approved : sendLetter(approved.id, "system:auto-approval");
  }
  return letter;
}

/** What the policy can still guarantee for this letter's patient, in the letter's currency (null without a policy). */
async function remainingForLetter(letter: { id: string; currency: string; case: { patientId: string; patient: { policy: { medicalLimit: Prisma.Decimal; medicalUsed: Prisma.Decimal; currency: string } | null } } }) {
  const policy = letter.case.patient.policy;
  if (!policy) return null;
  const committed = await committedGuarantees(letter.case.patientId, policy.currency, { excludeLetterId: letter.id });
  const left = Number(policy.medicalLimit) - Number(policy.medicalUsed) - committed.total;
  return { amount: round2(Math.max(0, convert(left, policy.currency, letter.currency))), committed };
}

type LetterForPdf = GuaranteeLetter & {
  case: { ref: string; title: string; patient: { id: string; firstName: string; lastName: string; dateOfBirth: Date; nationality: string; policyNumber: string; policy: { plan: string } | null } };
  provider: { address: string; district: string; city: string; country?: string; phone: string | null; email: string | null } | null;
};

/** Renders the letter's PDF and files it as a generated document on the case. */
async function storeLetterPdf(letter: LetterForPdf, guaranteed: number, by: string) {
  const estimateDoc = letter.estimateDocumentId
    ? await prisma.document.findUnique({ where: { id: letter.estimateDocumentId }, include: { extraction: true } })
    : null;
  const p = letter.case.patient;
  const pdf = await renderGuaranteeLetter({
    ref: letter.ref,
    issuedOn: zonedToday(),
    validUntil: letter.validUntil.toISOString().slice(0, 10),
    hospital: { name: letter.hospitalName, address: letter.provider ? `${letter.provider.address}, ${letter.provider.district}, ${letter.provider.city}` : null, fax: letter.provider?.phone ?? null, email: letter.provider?.email ?? null },
    patient: { name: `${p.firstName} ${p.lastName}`, dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10), nationality: p.nationality },
    policy: { number: p.policyNumber, plan: p.policy?.plan ?? "—" },
    caseRef: letter.case.ref,
    treatment: [estimateDoc?.extraction?.diagnosis, ...(estimateDoc?.extraction?.procedures ?? [])].filter(Boolean).join("; ") || letter.case.title,
    admissionDate: estimateDoc?.extraction?.admissionDate ?? null,
    guaranteedAmount: guaranteed,
    excess: Number(letter.excess),
    currency: letter.currency,
    conditions: letter.conditions,
    approvedBy: by.startsWith("system") ? "automatic approval (within policy and limits)" : by,
    // The hospital reads it in its own language too; without a known hospital, Turkish as before.
    lang: letter.provider ? letterLanguageFor(letter.provider.country) : "tr",
  });
  const filename = `letter-of-guarantee-${letter.ref.toLowerCase()}.pdf`;
  return prisma.document.create({
    data: {
      filename,
      mimeType: "application/pdf",
      sizeBytes: pdf.length,
      kind: "GUARANTEE_LETTER",
      status: "PROCESSED",
      source: "GENERATED",
      storagePath: await storeUpload(filename, pdf),
      caseId: letter.caseId,
      patientId: p.id,
    },
  });
}

/**
 * Approves a letter (optionally adjusting the amount) and generates its PDF.
 * Above what the policy can still guarantee, the approver must say why.
 */
export async function approveLetter(id: string, by: string, amount?: number, reason?: string): Promise<GuaranteeLetter> {
  const letter = await prisma.guaranteeLetter.findUnique({
    where: { id },
    include: { case: { include: { patient: { include: { policy: true } } } }, provider: true },
  });
  if (!letter) throw notFound("Letter of Guarantee");
  if (letter.status !== "DRAFT") throw conflict(`${letter.ref} is already ${letter.status.toLowerCase()}.`);
  const guaranteed = amount ?? Number(letter.guaranteedAmount);
  if (!(guaranteed > 0)) throw badRequest("The guaranteed amount must be greater than zero.");
  if (guaranteed > Number(letter.estimatedAmount)) throw badRequest("You can't guarantee more than the hospital's estimate.");
  const remaining = await remainingForLetter(letter);
  const override = remaining != null && guaranteed > remaining.amount + 0.005;
  if (override && !reason?.trim()) {
    throw new ApiError(
      `${guaranteed.toLocaleString("en-GB")} ${letter.currency} is above what the policy can still guarantee (${remaining.amount.toLocaleString("en-GB")} ${letter.currency}${remaining.committed.letters.length ? `, after ${remaining.committed.letters.map((l) => l.ref).join(", ")}` : ""}). Give a reason to approve it anyway.`,
      422,
      "REASON_REQUIRED"
    );
  }

  const pdfDoc = await storeLetterPdf(letter, guaranteed, by);
  const updated = await prisma.guaranteeLetter.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedBy: by,
      guaranteedAmount: guaranteed,
      pdfDocumentId: pdfDoc.id,
      ...(override
        ? {
            decisionTrace: {
              ...(letter.decisionTrace as Prisma.JsonObject),
              override: { amount: guaranteed, remaining: remaining!.amount, reason: reason!.trim(), by, at: new Date().toISOString() },
            },
          }
        : {}),
    },
  });
  await prisma.caseEvent.create({
    data: {
      caseId: letter.caseId,
      type: "LETTER_OF_GUARANTEE",
      title: `${letter.ref} approved: ${guaranteed.toLocaleString("en-GB")} ${letter.currency}`,
      body: by.startsWith("system")
        ? "Approved automatically: within policy and the automatic approval limit."
        : override
          ? `Approved by ${by} above what the policy can still guarantee (${remaining!.amount.toLocaleString("en-GB")} ${letter.currency}). Reason: ${reason!.trim()}`
          : `Approved by ${by}.`,
      actor: actorOf(by),
    },
  });
  return updated;
}

export async function rejectLetter(id: string, by: string, reason: string): Promise<GuaranteeLetter> {
  const letter = await prisma.guaranteeLetter.findUnique({ where: { id } });
  if (!letter) throw notFound("Letter of Guarantee");
  if (letter.status !== "DRAFT") throw conflict(`${letter.ref} is already ${letter.status.toLowerCase()}.`);
  const updated = await prisma.guaranteeLetter.update({ where: { id }, data: { status: "REJECTED", rejectionReason: reason, approvedBy: by } });
  await prisma.caseEvent.create({
    data: { caseId: letter.caseId, type: "LETTER_OF_GUARANTEE", title: `${letter.ref} declined`, body: reason, actor: actorOf(by) },
  });
  return updated;
}

/** Sends an approved letter to the hospital: fax when we have its number, else e-mail. */
export async function sendLetter(id: string, by: string): Promise<GuaranteeLetter> {
  const letter = await prisma.guaranteeLetter.findUnique({ where: { id }, include: { provider: true, case: true } });
  if (!letter) throw notFound("Letter of Guarantee");
  if (letter.status !== "APPROVED") throw conflict(`${letter.ref} must be approved before it is sent.`);
  const { via, to } = await deliver(letter, by);
  const updated = await prisma.guaranteeLetter.update({
    where: { id },
    data: { status: "SENT", sentVia: via, sentTo: to, sentAt: new Date() },
  });
  await prisma.caseEvent.create({
    data: {
      caseId: letter.caseId,
      type: "LETTER_OF_GUARANTEE",
      title: `${letter.ref} sent by ${via === "FAX" ? "fax" : "e-mail"} to ${letter.hospitalName}`,
      body: via === "FAX" ? `Fax ${to}` : `E-mail ${to}`,
      actor: actorOf(by),
    },
  });
  await notifyFamily(letter.caseId, "guarantee", { hospital: letter.hospitalName, letterRef: letter.ref });
  return updated;
}

/**
 * Sends an already-sent letter again, to the hospital on file only (never
 * to a number a caller dictates). Its status and dates stay as they were.
 */
export async function resendLetter(id: string, by: string): Promise<{ via: "FAX" | "EMAIL"; to: string }> {
  const letter = await prisma.guaranteeLetter.findUnique({ where: { id }, include: { provider: true, case: true } });
  if (!letter) throw notFound("Letter of Guarantee");
  if (letter.status !== "SENT" && letter.status !== "ACKNOWLEDGED") {
    throw conflict(`${letter.ref} hasn't been sent yet, so it can't be re-sent.`);
  }
  letter.pdfDocumentId = (await letterPdf(id)).documentId;
  const sent = await deliver(letter, by);
  await prisma.caseEvent.create({
    data: {
      caseId: letter.caseId,
      type: "LETTER_OF_GUARANTEE",
      title: `${letter.ref} re-sent by ${sent.via === "FAX" ? "fax" : "e-mail"} to ${letter.hospitalName}`,
      body: `${sent.via === "FAX" ? "Fax" : "E-mail"} ${sent.to}`,
      actor: actorOf(by),
    },
  });
  return sent;
}

/**
 * The letter's PDF, rendered now if it has none: seeded letters don't
 * (pdfkit can't run in the seed bundle).
 */
export async function letterPdf(id: string): Promise<{ filename: string; content: Buffer; documentId: string }> {
  const letter = await prisma.guaranteeLetter.findUniqueOrThrow({
    where: { id },
    include: { case: { include: { patient: { include: { policy: true } } } }, provider: true },
  });
  let doc = letter.pdfDocumentId ? await prisma.document.findUnique({ where: { id: letter.pdfDocumentId } }) : null;
  if (!doc?.storagePath) {
    doc = await storeLetterPdf(letter, Number(letter.guaranteedAmount), letter.approvedBy ?? "system:auto-approval");
    await prisma.guaranteeLetter.update({ where: { id }, data: { pdfDocumentId: doc.id } });
  }
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const content = await fs.readFile(path.join(path.resolve(env.uploadDir), path.basename(doc.storagePath!)));
  return { filename: doc.filename, content, documentId: doc.id };
}

/** Faxes the letter's PDF to the hospital (or e-mails it when there's no fax number). */
async function deliver(
  letter: GuaranteeLetter & { provider: { phone: string | null; email: string | null } | null; case: { ref: string } },
  by: string
): Promise<{ via: "FAX" | "EMAIL"; to: string }> {
  const pdfDoc = letter.pdfDocumentId ? await prisma.document.findUnique({ where: { id: letter.pdfDocumentId } }) : null;
  if (!pdfDoc?.storagePath) throw conflict(`${letter.ref} has no generated PDF.`);
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const pdf = await fs.readFile(path.join(path.resolve(env.uploadDir), path.basename(pdfDoc.storagePath)));
  const cover = `Letter of Guarantee ${letter.ref} for case ${letter.case.ref}: ${Number(letter.guaranteedAmount).toLocaleString("en-GB")} ${letter.currency}.`;

  const fax = letter.provider?.phone?.replace(/[^\d+]/g, "") ?? "";
  const email = letter.provider?.email ?? "";
  const via = fax ? "FAX" : "EMAIL";
  const out =
    via === "FAX"
      ? await sendFax({ to: fax, pdf, filename: pdfDoc.filename, cover, caseId: letter.caseId, attachmentDocumentId: pdfDoc.id, automatic: by.startsWith("system") || by.startsWith("agent:"), approvedBy: by })
      : await sendEmail({
          to: email || "billing@unknown-hospital.example",
          subject: `Letter of Guarantee ${letter.ref} — ${letter.case.ref}`,
          text: `${cover}\n\nPlease find the letter attached.\n\nMedical Assistance Desk (demonstration platform; fictional data)`,
          attachments: [{ filename: pdfDoc.filename, content: pdf, type: "application/pdf" }],
          caseId: letter.caseId,
          attachmentDocumentId: pdfDoc.id,
          automatic: by.startsWith("system") || by.startsWith("agent:"),
          approvedBy: by,
        });
  if (out.status === "FAILED") throw conflict(`Sending ${letter.ref} failed: ${out.error ?? "provider error"}.`);
  emit("guarantee.sent", { ref: letter.ref, case: letter.case.ref, amount: Number(letter.guaranteedAmount), currency: letter.currency, hospital: letter.hospitalName, via, sentAt: new Date().toISOString() });
  return { via, to: via === "FAX" ? fax : email };
}

export { acknowledgeLetter } from "./guarantee-status";
