import type { Claim, Document, DocumentExtraction, Patient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { runAI } from "./ai";
import { reviewBills } from "./bill-review-service";
import { convert } from "./exposure";
import { integritySignals, type IntegritySignal } from "./integrity";
import { getNotificationService } from "./notification";
import type { ClaimIssue } from "./types";

// ---------------------------------------------------------------------------
// ClaimsService: completeness checking, issue detection, AI summary and
// reviewer actions for demo claims.
// ---------------------------------------------------------------------------

type ClaimWithRelations = Claim & {
  patient: Patient;
  documents: (Document & { extraction: DocumentExtraction | null })[];
};

const REQUIRED_KINDS = [
  { kind: "MEDICAL_REPORT", label: "Medical report" },
  { kind: "HOSPITAL_INVOICE", label: "Hospital invoice" },
  { kind: "DISCHARGE_SUMMARY", label: "Discharge summary" },
] as const;

/** Senior-review limits from the claims procedure (knowledge base). */
export const OUTPATIENT_LIMIT_TRY = 20_000;
export const INPATIENT_LIMIT_TRY = 100_000;

export function checkCompleteness(claim: ClaimWithRelations): ClaimIssue[] {
  const issues: ClaimIssue[] = [];
  const kinds = new Set(claim.documents.map((d) => d.kind));

  for (const { kind, label } of REQUIRED_KINDS) {
    issues.push(
      kinds.has(kind)
        ? { severity: "ok", message: `${label} available` }
        : { severity: "error", message: `${label} missing` }
    );
  }
  if (!kinds.has("PRESCRIPTION")) {
    issues.push({ severity: "warning", message: "Prescription not provided (optional)" });
  } else {
    issues.push({ severity: "ok", message: "Prescription available" });
  }

  const extractions = claim.documents
    .map((d) => d.extraction)
    .filter((e): e is DocumentExtraction => e != null);
  const policyRef = extractions.find((e) => e.policyReference)?.policyReference;
  issues.push(
    policyRef
      ? { severity: "ok", message: `Policy number found (${policyRef})` }
      : { severity: "error", message: "Policy number missing" }
  );

  const amount = extractions.find((e) => e.invoiceAmount != null)?.invoiceAmount;
  if (amount == null && claim.amount == null) {
    issues.push({ severity: "warning", message: "Claimed amount could not be determined" });
  }

  // Authority limits from the claims procedure: larger claims go to a senior reviewer.
  const priced =
    claim.documents.find((d) => d.kind === "HOSPITAL_INVOICE" && d.extraction?.invoiceAmount != null && d.extraction.currency)?.extraction ??
    extractions.find((e) => e.invoiceAmount != null && e.currency);
  if (priced?.invoiceAmount != null && priced.currency) {
    const inpatient = kinds.has("DISCHARGE_SUMMARY") || extractions.some((e) => e.dischargeDate);
    const limit = inpatient ? INPATIENT_LIMIT_TRY : OUTPATIENT_LIMIT_TRY;
    if (convert(Number(priced.invoiceAmount), priced.currency, "TRY") > limit) {
      issues.push({
        severity: "warning",
        message: `Above the ${inpatient ? "inpatient" : "outpatient"} limit of ${limit.toLocaleString("en-GB")} TRY: a senior reviewer decides`,
      });
    }
  }

  const failed = claim.documents.filter((d) => d.status === "FAILED");
  for (const doc of failed) {
    issues.push({ severity: "error", message: `Document "${doc.filename}" failed processing` });
  }

  return issues;
}

/** Integrity checks for a claim, with the context they need from other claims and the inbox. */
export async function claimSignals(claimId: string): Promise<IntegritySignal[]> {
  const claim = await prisma.claim.findUniqueOrThrow({
    where: { id: claimId },
    include: { patient: { include: { policy: true } }, documents: { include: { extraction: true } } },
  });
  const docs = claim.documents.filter((d) => d.extraction);
  const numbers = docs.map((d) => d.extraction!.documentNumber).filter((n): n is string => !!n);
  const [twins, bankChanges] = await Promise.all([
    numbers.length
      ? prisma.documentExtraction.findMany({
          where: { documentNumber: { in: numbers }, document: { claimId: { not: null }, NOT: { claimId: claim.id } } },
          select: { documentNumber: true, document: { select: { claim: { select: { ref: true } } } } },
        })
      : Promise.resolve([]),
    claim.caseId
      ? prisma.inboundMessage.findMany({ where: { matchedCaseId: claim.caseId, riskFlags: { has: "Fraud indicator" } }, select: { ref: true } })
      : Promise.resolve([]),
  ]);
  const p = claim.patient;
  return integritySignals({
    policy: p.policy ? { validFrom: p.policy.validFrom, validTo: p.policy.validTo } : null,
    holder: { firstName: p.firstName, lastName: p.lastName, dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10) },
    documents: docs.map((d) => {
      const e = d.extraction!;
      const lines = Array.isArray(e.lineItems) ? (e.lineItems as { amount?: number | null }[]) : [];
      return {
        filename: d.filename,
        documentNumber: e.documentNumber,
        patientName: e.patientName,
        dateOfBirth: e.dateOfBirth,
        admissionDate: e.admissionDate,
        dischargeDate: e.dischargeDate,
        invoiceAmount: e.invoiceAmount == null ? null : Number(e.invoiceAmount),
        currency: e.currency,
        lineSum: lines.length ? Math.round(lines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100) / 100 : null,
      };
    }),
    duplicates: twins.flatMap((t) => (t.documentNumber && t.document.claim ? [{ documentNumber: t.documentNumber, claimRef: t.document.claim.ref }] : [])),
    bankChangeMessages: bankChanges.map((m) => m.ref),
  });
}

/** A reviewer refers a claim to the fraud team: escalated, and written to the claim and the case. */
export async function referClaimToFraudTeam(claimId: string, by: string, note?: string): Promise<Claim> {
  const claim = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!claim) throw notFound("Claim");
  const updated = await prisma.claim.update({
    where: { id: claimId },
    data: { status: "ESCALATED", history: appendHistory(claim.history, "Referred to the fraud team", note?.trim() || null, by) },
  });
  if (claim.caseId) {
    await prisma.caseEvent.create({
      data: { caseId: claim.caseId, type: "CLAIM", title: `${claim.ref} referred to the fraud team`, body: note?.trim() || null, actor: `operator:${by}` },
    });
  }
  return updated;
}

/** Re-runs completeness + AI summary for a claim and stores the result. */
export async function reviewClaim(claimId: string): Promise<ClaimWithRelations> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { patient: true, documents: { include: { extraction: true } } },
  });
  if (!claim) throw notFound("Claim");

  const issues = checkCompleteness(claim);
  // Bill review of the claim's invoices (kept off `issues`: travellers see those).
  await reviewBills(claim.documents.filter((d) => d.kind === "HOSPITAL_INVOICE").map((d) => d.id));
  // Financial fields come from the invoice when there is one; the first
  // extraction is only a fallback (a medical report has no amount).
  const extractions = claim.documents
    .map((d) => d.extraction)
    .filter((e): e is DocumentExtraction => e != null);
  const invoiceExtraction =
    claim.documents.find((d) => d.kind === "HOSPITAL_INVOICE" && d.extraction)
      ?.extraction ?? extractions.find((e) => e.invoiceAmount != null);
  const extraction = {
    diagnosis: extractions.find((e) => e.diagnosis)?.diagnosis ?? null,
    hospital: extractions.find((e) => e.hospital)?.hospital ?? null,
    invoiceAmount: invoiceExtraction?.invoiceAmount ?? null,
    currency: invoiceExtraction?.currency ?? null,
    policyReference:
      extractions.find((e) => e.policyReference)?.policyReference ?? null,
  };

  const { value: summary, source: aiSource } = await runAI("summarizeClaim", (ai) =>
    ai.summarizeClaim({
      claimRef: claim.ref,
      patientName: `${claim.patient.firstName} ${claim.patient.lastName}`,
      documents: claim.documents.map((d) => ({ kind: d.kind, filename: d.filename })),
      extraction: {
        diagnosis: extraction.diagnosis,
        hospital: extraction.hospital,
        invoiceAmount:
          extraction.invoiceAmount != null ? Number(extraction.invoiceAmount) : null,
        currency: extraction.currency,
        policyReference: extraction.policyReference,
      },
      issues,
    })
  );

  const amount = claim.amount ?? extraction.invoiceAmount ?? null;
  const currency = claim.currency ?? extraction.currency ?? null;
  const signals = await claimSignals(claim.id);

  return prisma.claim.update({
    where: { id: claimId },
    data: {
      issues: JSON.parse(JSON.stringify(issues)),
      signals: JSON.parse(JSON.stringify(signals)),
      summary,
      aiSource,
      amount,
      currency,
      // Every analysed claim lands with a human — the AI never auto-approves.
      status:
        claim.status === "SUBMITTED" || claim.status === "PROCESSING"
          ? "NEEDS_REVIEW"
          : claim.status,
      history: appendHistory(claim.history, "AI review completed", summary),
    },
    include: { patient: true, documents: { include: { extraction: true } } },
  }) as Promise<ClaimWithRelations>;
}

export type ClaimAction = "APPROVE" | "REQUEST_INFO" | "ESCALATE";

export async function applyClaimAction(
  claimId: string,
  action: ClaimAction,
  note?: string,
  actor?: string
): Promise<Claim> {
  const claim = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!claim) throw notFound("Claim");
  if (claim.status === "PAID") {
    throw badRequest("This claim is already paid and can no longer be actioned.");
  }

  const statusMap: Record<ClaimAction, Claim["status"]> = {
    APPROVE: "APPROVED",
    REQUEST_INFO: "INFO_REQUESTED",
    ESCALATE: "ESCALATED",
  };
  const labelMap: Record<ClaimAction, string> = {
    APPROVE: "Approved by reviewer",
    REQUEST_INFO: "Additional information requested",
    ESCALATE: "Escalated to senior claims handler",
  };

  const updated = await prisma.claim.update({
    where: { id: claimId },
    data: {
      status: statusMap[action],
      history: appendHistory(claim.history, labelMap[action], note, actor),
    },
  });

  await getNotificationService().notify({
    kind: "CLAIM_UPDATED",
    subject: `Claim ${updated.ref}: ${labelMap[action]}`,
    body: note ?? "",
  });

  return updated;
}

function appendHistory(history: unknown, action: string, note?: string | null, by?: string) {
  const list = Array.isArray(history) ? [...history] : [];
  list.push({ at: new Date().toISOString(), action, note: note ?? null, ...(by ? { by } : {}) });
  return list;
}
