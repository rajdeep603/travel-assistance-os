import type { GuaranteeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { round2, toEur } from "@/lib/fx";

// ---------------------------------------------------------------------------
// Money on a policy and a case: what is committed in open guarantees, what
// was billed, what bill review recommends and what remains at risk. An open
// guarantee is approved, sent or acknowledged, still valid, on a case that
// isn't resolved or closed; drafts never count.
// ---------------------------------------------------------------------------

export const OPEN_GUARANTEE: GuaranteeStatus[] = ["APPROVED", "SENT", "ACKNOWLEDGED"];

export function openGuaranteeWhere(now = new Date()): Prisma.GuaranteeLetterWhereInput {
  return { status: { in: OPEN_GUARANTEE }, validUntil: { gte: now }, case: { status: { notIn: ["RESOLVED", "CLOSED"] } } };
}

/** An amount in another currency, via EUR at the demo rates. */
export function convert(amount: number, from: string, to: string): number {
  if (from.toUpperCase() === to.toUpperCase()) return amount;
  const eur = toEur(amount, from);
  const per = toEur(1, to);
  return eur == null || per == null ? 0 : eur / per;
}

/** The patient's open guarantees, in the policy's currency. */
export async function committedGuarantees(
  patientId: string,
  currency: string,
  opts: { excludeLetterId?: string; now?: Date } = {}
): Promise<{ total: number; letters: { ref: string; amount: number; currency: string }[] }> {
  const where = openGuaranteeWhere(opts.now);
  const letters = await prisma.guaranteeLetter.findMany({
    where: { ...where, case: { ...(where.case as object), patientId }, ...(opts.excludeLetterId ? { id: { not: opts.excludeLetterId } } : {}) },
    select: { ref: true, guaranteedAmount: true, currency: true },
  });
  const list = letters.map((l) => ({ ref: l.ref, amount: Number(l.guaranteedAmount), currency: l.currency }));
  return { total: round2(list.reduce((s, l) => s + convert(l.amount, l.currency, currency), 0)), letters: list };
}

export interface CaseMoney {
  /** Everything in EUR, at the demo rates, so a case reads as one figure. */
  estimated: number;
  guaranteed: number;
  invoiced: number;
  afterReview: number;
  paid: number;
  /** What the case is still expected to cost: reviewed invoices once billed, else open guarantees. */
  expected: number;
  exposure: number;
  savingsIdentified: number;
  savingsAccepted: number;
  openLetters: { ref: string; amount: number; currency: string }[];
  policy: { number: string; plan: string; limit: number; used: number; committed: number; remaining: number; currency: string } | null;
}

const inEur = (amount: number, currency: string) => toEur(amount, currency) ?? 0;

type ReviewMoney = { billed: unknown; recommended?: unknown; savingsEur: unknown; agreedAmount: unknown; currency: string; status: string };

/** What will be paid on a reviewed bill: the amount agreed with the hospital, else the recommendation. */
const payable = (r: ReviewMoney) => Number(r.agreedAmount ?? r.recommended);

/** The saving a person accepted, at the amount the hospital agreed to when there was a negotiation. */
export const realisedSavingEur = (r: ReviewMoney): number =>
  r.status !== "ACCEPTED" ? 0 : r.agreedAmount != null ? inEur(Number(r.billed) - Number(r.agreedAmount), r.currency) : Number(r.savingsEur ?? 0);

export async function caseMoney(caseId: string, now = new Date()): Promise<CaseMoney | null> {
  const kase = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      patient: { include: { policy: true } },
      guaranteeLetters: { where: { status: { in: OPEN_GUARANTEE } } },
      documents: { where: { kind: { in: ["COST_ESTIMATE", "HOSPITAL_INVOICE"] } }, include: { extraction: true, billReview: true } },
      claims: { where: { status: "PAID" } },
    },
  });
  if (!kase) return null;
  const open = kase.guaranteeLetters.filter((l) => l.validUntil >= now && !["RESOLVED", "CLOSED"].includes(kase.status));
  const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));
  const billed = (kind: "COST_ESTIMATE" | "HOSPITAL_INVOICE") =>
    kase.documents.filter((d) => d.kind === kind && d.extraction?.invoiceAmount != null && d.extraction.currency);
  const invoices = billed("HOSPITAL_INVOICE");
  const estimated = sum(billed("COST_ESTIMATE").map((d) => inEur(Number(d.extraction!.invoiceAmount), d.extraction!.currency!)));
  const invoiced = sum(invoices.map((d) => inEur(Number(d.extraction!.invoiceAmount), d.extraction!.currency!)));
  // After review: the recommended amount unless a person decided to pay as billed.
  const afterReview = sum(
    invoices.map((d) => {
      const r = d.billReview;
      const amount = r && r.status !== "WAIVED" ? payable(r) : Number(d.extraction!.invoiceAmount);
      return inEur(amount, r?.currency ?? d.extraction!.currency!);
    })
  );
  const guaranteed = sum(open.map((l) => inEur(Number(l.guaranteedAmount), l.currency)));
  const paid = sum(kase.claims.map((c) => (c.amount != null && c.currency ? inEur(Number(c.amount), c.currency) : 0)));
  const reviews = kase.documents.map((d) => d.billReview).filter((r): r is NonNullable<typeof r> => r != null && r.kind === "HOSPITAL_INVOICE");
  const expected = invoices.length ? afterReview : guaranteed;
  const policy = kase.patient.policy;
  let policyView: CaseMoney["policy"] = null;
  if (policy) {
    const committed = await committedGuarantees(kase.patientId, policy.currency, { now });
    const limit = Number(policy.medicalLimit);
    const used = Number(policy.medicalUsed);
    policyView = {
      number: policy.number,
      plan: policy.plan,
      limit,
      used,
      committed: committed.total,
      remaining: round2(Math.max(0, limit - used - committed.total)),
      currency: policy.currency,
    };
  }
  return {
    estimated,
    guaranteed,
    invoiced,
    afterReview,
    paid,
    expected,
    exposure: round2(Math.max(0, expected - paid)),
    savingsIdentified: sum(reviews.map((r) => Number(r.savingsEur ?? 0))),
    savingsAccepted: sum(reviews.map(realisedSavingEur)),
    openLetters: open.map((l) => ({ ref: l.ref, amount: Number(l.guaranteedAmount), currency: l.currency })),
    policy: policyView,
  };
}

export interface MoneyOutcomes {
  days: number;
  billsReviewed: number;
  savingsIdentifiedEur: number;
  savingsAcceptedEur: number;
  awaitingDecision: number;
  /** Savings as a share of the amount billed on invoices reviewed in the window. */
  averageSavingShare: number | null;
  openGuarantees: { count: number; eur: number };
}

/** The money row of the overview: what bill review found and what is committed. */
export async function getMoneyOutcomes(days = 30, now = new Date()): Promise<MoneyOutcomes> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const [reviews, letters] = await Promise.all([
    prisma.billReview.findMany({
      where: { kind: "HOSPITAL_INVOICE", createdAt: { gte: since } },
      select: { billed: true, savings: true, savingsEur: true, agreedAmount: true, currency: true, status: true },
    }),
    prisma.guaranteeLetter.findMany({ where: openGuaranteeWhere(now), select: { guaranteedAmount: true, currency: true } }),
  ]);
  const billedEur = reviews.reduce((s, r) => s + inEur(Number(r.billed), r.currency), 0);
  const identified = reviews.reduce((s, r) => s + Number(r.savingsEur ?? 0), 0);
  return {
    days,
    billsReviewed: reviews.length,
    savingsIdentifiedEur: round2(identified),
    savingsAcceptedEur: round2(reviews.reduce((s, r) => s + realisedSavingEur(r), 0)),
    awaitingDecision: reviews.filter((r) => r.status === "PROPOSED" && Number(r.savings) > 0).length,
    averageSavingShare: billedEur > 0 ? identified / billedEur : null,
    openGuarantees: { count: letters.length, eur: round2(letters.reduce((s, l) => s + inEur(Number(l.guaranteedAmount), l.currency), 0)) },
  };
}
