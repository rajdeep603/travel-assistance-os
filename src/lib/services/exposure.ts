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
