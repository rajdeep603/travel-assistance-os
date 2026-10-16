import { createHash } from "node:crypto";
import type { BillReview, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { round2, toEur } from "@/lib/fx";
import { reviewBill, type BillLine, type BillReviewResult } from "./bill-review";

// ---------------------------------------------------------------------------
// Runs bill review on a stored invoice or cost estimate, with the context of
// its case: the diagnosis from the case's medical documents, and the
// guarantee the bill answers. Idempotent: re-reviewing unchanged lines keeps
// a person's decision. Called wherever an invoice meets its context (claim
// review, intake filing, upload, guarantee drafting), never at OCR time.
// ---------------------------------------------------------------------------

const BILL_KINDS = ["HOSPITAL_INVOICE", "COST_ESTIMATE"] as const;
const OPEN_LETTER: Prisma.GuaranteeLetterWhereInput = { status: { in: ["APPROVED", "SENT", "ACKNOWLEDGED"] } };

export interface StoredReview extends BillReviewResult {
  /** For a final invoice on a guaranteed case: how it compares with the guarantee. */
  guarantee: { ref: string; amount: number; currency: string; exceedsBy: number; recommendedExceedsBy: number } | null;
}

const money = (n: number, ccy: string) => `${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`;

/** The stored review's result, typed. */
export const reviewResult = (r: Pick<BillReview, "result">) => r.result as unknown as StoredReview;

export async function reviewBillForDocument(documentId: string): Promise<BillReview | null> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { extraction: true, billReview: true },
  });
  const ex = doc?.extraction;
  if (!doc || !ex || !(BILL_KINDS as readonly string[]).includes(doc.kind)) return null;
  const lines = (Array.isArray(ex.lineItems) ? ex.lineItems : []) as unknown as BillLine[];
  if (lines.length === 0) return null;

  // The diagnosis decides the usual length of stay; invoices often leave it out.
  let diagnosis = ex.diagnosis;
  if (!diagnosis && (doc.caseId || doc.claimId)) {
    const other = await prisma.documentExtraction.findFirst({
      where: {
        diagnosis: { not: null },
        document: { id: { not: doc.id }, OR: [...(doc.caseId ? [{ caseId: doc.caseId }] : []), ...(doc.claimId ? [{ claimId: doc.claimId }] : [])] },
      },
      orderBy: { createdAt: "desc" },
      select: { diagnosis: true },
    });
    diagnosis = other?.diagnosis ?? null;
  }

  const currency = (ex.currency ?? "EUR").toUpperCase();
  const kind = doc.kind as (typeof BILL_KINDS)[number];
  const total = ex.invoiceAmount == null ? null : Number(ex.invoiceAmount);
  const base = reviewBill({ kind, lines, total, currency, diagnosis, admissionDate: ex.admissionDate, dischargeDate: ex.dischargeDate });

  // An estimate is answered by the letter drafted from it; a final invoice settles the case's open guarantee.
  const letter =
    kind === "COST_ESTIMATE"
      ? await prisma.guaranteeLetter.findFirst({ where: { estimateDocumentId: doc.id }, orderBy: { createdAt: "desc" } })
      : doc.caseId
        ? await prisma.guaranteeLetter.findFirst({ where: { caseId: doc.caseId, ...OPEN_LETTER }, orderBy: { createdAt: "desc" } })
        : null;
  let guarantee: StoredReview["guarantee"] = null;
  if (letter && kind === "HOSPITAL_INVOICE") {
    const amount = Number(letter.guaranteedAmount);
    const inLetterCcy = (n: number) => (letter.currency === currency ? n : ((toEur(n, currency) ?? 0) / (toEur(1, letter.currency) ?? 1)));
    guarantee = {
      ref: letter.ref,
      amount,
      currency: letter.currency,
      exceedsBy: round2(Math.max(0, inLetterCcy(base.billed) - amount)),
      recommendedExceedsBy: round2(Math.max(0, inLetterCcy(base.recommended) - amount)),
    };
  }
  const result: StoredReview = { ...base, guarantee };

  const inputHash = createHash("sha256").update(JSON.stringify({ lines, total, currency, ruleset: base.ruleset })).digest("hex").slice(0, 32);
  const prior = doc.billReview;
  const unchanged = prior?.inputHash === inputHash;
  const data = {
    caseId: doc.caseId,
    claimId: doc.claimId,
    guaranteeLetterId: letter?.id ?? null,
    kind,
    hospital: ex.hospital,
    currency,
    billed: base.billed,
    recommended: base.recommended,
    savings: base.savings,
    savingsEur: base.savingsEur,
    result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
    ruleset: base.ruleset,
    inputHash,
    ...(unchanged ? {} : { status: "PROPOSED" as const, decidedBy: null, decidedAt: null }),
  };
  const review = prior
    ? await prisma.billReview.update({ where: { id: prior.id }, data })
    : await prisma.billReview.create({ data: { documentId: doc.id, ...data } });

  if (!unchanged && doc.caseId) {
    const found = base.findings.filter((f) => f.saving > 0).length;
    await prisma.caseEvent.create({
      data: {
        caseId: doc.caseId,
        type: "BILL_REVIEW",
        title:
          base.savings > 0
            ? `Bill review: ${money(base.savings, currency)} above the reference tariff on ${ex.documentNumber ?? doc.filename}`
            : `Bill review: ${ex.documentNumber ?? doc.filename} is within the reference tariff`,
        body: [
          `Billed ${money(base.billed, currency)}, recommended ${money(base.recommended, currency)} (${found} finding${found === 1 ? "" : "s"}).`,
          guarantee && guarantee.exceedsBy > 0
            ? `Exceeds ${guarantee.ref} by ${money(guarantee.exceedsBy, guarantee.currency)}${guarantee.recommendedExceedsBy > 0 ? `; still ${money(guarantee.recommendedExceedsBy, guarantee.currency)} above it after review.` : "; within the guarantee after review."}`
            : null,
          kind === "COST_ESTIMATE" && base.savings > 0 ? "Before treatment this is advice only: the guarantee is not cut on price." : null,
        ]
          .filter(Boolean)
          .join(" "),
        actor: "agent:bill-review",
      },
    });
  }
  return review;
}

/** Reviews every invoice and estimate in a list of documents; never fails the caller. */
export async function reviewBills(documentIds: string[]): Promise<void> {
  for (const id of documentIds) {
    try {
      await reviewBillForDocument(id);
    } catch (err) {
      console.error(`[bill-review] ${id} failed:`, err);
    }
  }
}

/** A person accepts the recommendation or decides to pay as billed. */
export async function decideBillReview(id: string, decision: "ACCEPTED" | "WAIVED", by: string, note?: string): Promise<BillReview> {
  const review = await prisma.billReview.findUnique({ where: { id }, include: { document: { select: { filename: true, extraction: { select: { documentNumber: true } } } } } });
  if (!review) throw notFound("Bill review");
  if (review.status !== "PROPOSED") throw conflict(`This review was already ${review.status.toLowerCase()}.`);
  const updated = await prisma.billReview.update({ where: { id }, data: { status: decision, decidedBy: by, decidedAt: new Date() } });
  if (review.caseId) {
    const name = review.document.extraction?.documentNumber ?? review.document.filename;
    const ccy = review.currency;
    await prisma.caseEvent.create({
      data: {
        caseId: review.caseId,
        type: "BILL_REVIEW",
        title:
          decision === "ACCEPTED"
            ? `Bill review accepted on ${name}: pay ${money(Number(review.recommended), ccy)}, saving ${money(Number(review.savings), ccy)}`
            : `Bill review waived on ${name}: pay as billed (${money(Number(review.billed), ccy)})`,
        body: note?.trim() || null,
        actor: by.startsWith("system") ? by : `operator:${by}`,
      },
    });
  }
  return updated;
}
