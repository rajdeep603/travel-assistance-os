import type { Claim, Document, DocumentExtraction, Patient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { getAIService } from "./ai";
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

  const failed = claim.documents.filter((d) => d.status === "FAILED");
  for (const doc of failed) {
    issues.push({ severity: "error", message: `Document "${doc.filename}" failed processing` });
  }

  return issues;
}

/** Re-runs completeness + AI summary for a claim and stores the result. */
export async function reviewClaim(claimId: string): Promise<ClaimWithRelations> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { patient: true, documents: { include: { extraction: true } } },
  });
  if (!claim) throw notFound("Claim");

  const issues = checkCompleteness(claim);
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

  const summary = await getAIService().summarizeClaim({
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
  });

  const amount = claim.amount ?? extraction.invoiceAmount ?? null;
  const currency = claim.currency ?? extraction.currency ?? null;

  return prisma.claim.update({
    where: { id: claimId },
    data: {
      issues: JSON.parse(JSON.stringify(issues)),
      summary,
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
  note?: string
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
      history: appendHistory(claim.history, labelMap[action], note),
    },
  });

  await getNotificationService().notify({
    kind: "CLAIM_UPDATED",
    subject: `Claim ${updated.ref}: ${labelMap[action]}`,
    body: note ?? "",
  });

  return updated;
}

function appendHistory(history: unknown, action: string, note?: string | null) {
  const list = Array.isArray(history) ? [...history] : [];
  list.push({ at: new Date().toISOString(), action, note: note ?? null });
  return list;
}
