import type { Prisma, Receivable, ReceivableStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { round2, toEur } from "@/lib/fx";
import { addDays, zonedToday } from "@/lib/time";
import { reviewBill, type BillLine } from "./bill-review";
import { sendEmail } from "./outbox";
import { emit } from "./webhooks";

// ---------------------------------------------------------------------------
// The receiving side of a guarantee: a hospital's or local correspondent's
// invoices to foreign payers, how long each has waited, and who chases it.
// Before an invoice goes out, the payer-ready check runs the same rules the
// payer's own bill review will (comfort items, duplicates, nights, prices),
// so the invoice is clean the first time and gets paid instead of queried.
// ---------------------------------------------------------------------------

/** Not yet paid in full. */
export const OPEN_RECEIVABLE: ReceivableStatus[] = ["SUBMITTED", "ACKNOWLEDGED", "APPROVED", "PARTIALLY_PAID", "DISPUTED"];

export type AgeBucket = "0-30" | "31-60" | "61-90" | "90+";
export const AGE_BUCKETS: AgeBucket[] = ["0-30", "31-60", "61-90", "90+"];

const DAY = 86_400_000;

export function daysOutstanding(r: Pick<Receivable, "submittedAt" | "status" | "paidAt">, now = new Date()): number | null {
  if (!r.submittedAt) return null;
  const end = r.status === "PAID" && r.paidAt ? r.paidAt : now;
  return Math.max(0, Math.floor((end.getTime() - r.submittedAt.getTime()) / DAY));
}

export function bucketOf(days: number): AgeBucket {
  return days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
}

const balance = (r: Pick<Receivable, "amount" | "paidAmount">) => round2(Number(r.amount) - Number(r.paidAmount));
const eur = (amount: number, currency: string) => round2(toEur(amount, currency) ?? 0);
const money = (n: number, ccy: string) => `${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`;

export interface ReceivablesOverview {
  /** Unpaid balances, in EUR at the demo rates. */
  outstandingEur: number;
  overdueEur: number;
  overdueCount: number;
  disputedCount: number;
  /** Average days from submission to payment, over paid invoices. */
  averageDaysToPay: number | null;
  /** Outstanding EUR by payer and age. */
  byPayer: { payer: string; country: string | null; buckets: Record<AgeBucket, number>; total: number; count: number }[];
  buckets: Record<AgeBucket, number>;
  facilities: string[];
  receivables: (Receivable & { days: number | null; balance: number; overdue: boolean })[];
}

export async function receivablesOverview(opts: { facility?: string | null } = {}, now = new Date()): Promise<ReceivablesOverview> {
  const all = await prisma.receivable.findMany({
    where: opts.facility ? { facility: opts.facility } : {},
    orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
  });
  const facilities = (await prisma.receivable.findMany({ distinct: ["facility"], select: { facility: true }, orderBy: { facility: "asc" } })).map((f) => f.facility);
  const empty = (): Record<AgeBucket, number> => ({ "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 });
  const buckets = empty();
  const payers = new Map<string, ReceivablesOverview["byPayer"][number]>();
  let outstandingEur = 0;
  let overdueEur = 0;
  let overdueCount = 0;
  const paidDays: number[] = [];
  const rows = all.map((r) => {
    const days = daysOutstanding(r, now);
    const open = OPEN_RECEIVABLE.includes(r.status);
    const overdue = open && !!r.dueAt && r.dueAt < now;
    const bal = balance(r);
    if (r.status === "PAID" && days != null) paidDays.push(days);
    if (open && days != null) {
      const value = eur(bal, r.currency);
      const b = bucketOf(days);
      outstandingEur += value;
      buckets[b] += value;
      if (overdue) {
        overdueEur += value;
        overdueCount++;
      }
      const p = payers.get(r.payerName) ?? { payer: r.payerName, country: r.payerCountry, buckets: empty(), total: 0, count: 0 };
      p.buckets[b] = round2(p.buckets[b] + value);
      p.total = round2(p.total + value);
      p.count++;
      payers.set(r.payerName, p);
    }
    return { ...r, days, balance: bal, overdue };
  });
  return {
    outstandingEur: round2(outstandingEur),
    overdueEur: round2(overdueEur),
    overdueCount,
    disputedCount: all.filter((r) => r.status === "DISPUTED").length,
    averageDaysToPay: paidDays.length ? Math.round(paidDays.reduce((s, d) => s + d, 0) / paidDays.length) : null,
    byPayer: [...payers.values()].sort((a, b) => b.total - a.total),
    buckets: Object.fromEntries(AGE_BUCKETS.map((b) => [b, round2(buckets[b])])) as Record<AgeBucket, number>,
    facilities,
    receivables: rows,
  };
}

export interface ReadinessCheck {
  label: string;
  ok: boolean;
  /** "error" blocks a clean submission; "warning" is likely to be queried. */
  severity: "error" | "warning";
  fix?: string;
}

export interface Readiness {
  ready: boolean;
  checks: ReadinessCheck[];
  /** What the payer's review will likely take off, in the invoice currency. */
  expectedDeduction: number;
  /** The amount the payer's review is likely to accept. */
  cleanAmount: number;
  at: string;
}

/**
 * The payer-ready check: the payer's own bill review, run before the invoice
 * leaves, plus the paperwork payers return invoices for.
 */
export function payerReadyCheck(r: Receivable): Readiness {
  const checks: ReadinessCheck[] = [];
  const lines = (Array.isArray(r.lines) ? r.lines : []) as unknown as BillLine[];
  const amount = Number(r.amount);
  checks.push(
    r.gopRef
      ? { label: `Quotes the payer's guarantee (${r.gopRef})`, ok: true, severity: "error" }
      : { label: "Quotes the payer's guarantee", ok: false, severity: "error", fix: "Ask the payer for its guarantee reference and quote it on the invoice." }
  );
  if (r.gopAmount != null) {
    const gop = Number(r.gopAmount);
    checks.push(
      amount <= gop + 0.005
        ? { label: `Within the guaranteed ${money(gop, r.currency)}`, ok: true, severity: "error" }
        : { label: `Within the guaranteed ${money(gop, r.currency)}`, ok: false, severity: "error", fix: `Ask for a top-up of ${money(round2(amount - gop), r.currency)} before invoicing it, with a medical update.` }
    );
  }
  checks.push(
    r.policyNumber && r.dateOfBirth
      ? { label: "Policy number and date of birth on the invoice", ok: true, severity: "error" }
      : { label: "Policy number and date of birth on the invoice", ok: false, severity: "error", fix: "Add the traveller's policy number and date of birth: payers match on both." }
  );
  checks.push(
    lines.length
      ? { label: `Itemised, with codes (${lines.length} lines)`, ok: true, severity: "error" }
      : { label: "Itemised, with codes", ok: false, severity: "error", fix: "Send an itemised invoice: one line per service, with its code, quantity and unit price." }
  );
  const hasReport = r.attachments.some((a) => /medical report|discharge/i.test(a));
  checks.push(
    hasReport
      ? { label: "Medical report attached", ok: true, severity: "error" }
      : { label: "Medical report attached", ok: false, severity: "error", fix: "Attach the medical report or discharge summary: payers don't pay without it." }
  );
  const english = r.attachments.some((a) => /english/i.test(a));
  checks.push(
    english
      ? { label: "Medical report in English", ok: true, severity: "warning" }
      : { label: "Medical report in English", ok: false, severity: "warning", fix: "Attach an English translation of the report (the platform translates it)." }
  );

  let expectedDeduction = 0;
  let cleanAmount = amount;
  if (lines.length) {
    const review = reviewBill({
      kind: "HOSPITAL_INVOICE",
      lines,
      total: amount,
      currency: r.currency,
      diagnosis: r.diagnosis,
      admissionDate: r.serviceFrom,
      dischargeDate: r.serviceTo,
    });
    const sum = (rule: string) => round2(review.findings.filter((f) => f.rule === rule).reduce((s, f) => s + f.saving, 0));
    const comfort = sum("NON_MEDICAL");
    const dupes = sum("DUPLICATE");
    const nights = sum("EXTRA_NIGHTS");
    const price = sum("PRICE_ABOVE_REFERENCE");
    checks.push(
      comfort
        ? { label: "No comfort items billed to the payer", ok: false, severity: "error", fix: `Bill the ${money(comfort, r.currency)} of comfort items (suite, phone, TV, minibar, guest meals) to the traveller, not the payer.` }
        : { label: "No comfort items billed to the payer", ok: true, severity: "error" }
    );
    checks.push(
      dupes
        ? { label: "No line billed twice", ok: false, severity: "error", fix: `Remove the duplicated line (${money(dupes, r.currency)}).` }
        : { label: "No line billed twice", ok: true, severity: "error" }
    );
    checks.push(
      nights
        ? { label: "Nights match the stay dates", ok: false, severity: "error", fix: `Bill the nights of the stay only (${r.serviceFrom} to ${r.serviceTo}): ${money(nights, r.currency)} too many.` }
        : { label: "Nights match the stay dates", ok: true, severity: "error" }
    );
    checks.push(
      price
        ? { label: "Prices within what payers accept", ok: false, severity: "warning", fix: `About ${money(price, r.currency)} is above the reference prices payers use: expect it to be queried, or attach your agreed rates.` }
        : { label: "Prices within what payers accept", ok: true, severity: "warning" }
    );
    expectedDeduction = review.savings;
    cleanAmount = review.recommended;
  }
  return {
    ready: checks.every((c) => c.ok || c.severity === "warning"),
    checks,
    expectedDeduction: round2(expectedDeduction),
    cleanAmount: round2(cleanAmount),
    at: new Date().toISOString(),
  };
}

async function byRef(ref: string) {
  const r = await prisma.receivable.findFirst({ where: { OR: [{ id: ref }, { ref: ref.toUpperCase() }] } });
  if (!r) throw notFound("Invoice");
  return r;
}

type Chase = { at: string; channel: "EMAIL" | "PHONE"; outcome: string; note?: string | null; by: string; callRef?: string | null };
const chasesOf = (r: Pick<Receivable, "chases">) => (Array.isArray(r.chases) ? (r.chases as unknown as Chase[]) : []);

export async function runPayerReadyCheck(ref: string) {
  const r = await byRef(ref);
  const readiness = payerReadyCheck(r);
  return prisma.receivable.update({ where: { id: r.id }, data: { readiness: readiness as unknown as Prisma.InputJsonValue } });
}

/** Sends the invoice pack to the payer; the 30-day clock starts. */
export async function submitReceivable(ref: string, by: string) {
  const r = await byRef(ref);
  if (r.status !== "DRAFT") throw conflict(`${r.ref} was already sent.`);
  if (!r.payerEmail) throw badRequest("Add the payer's e-mail address first.");
  const readiness = payerReadyCheck(r);
  const now = new Date();
  await sendEmail({
    to: `${r.payerName} <${r.payerEmail}>`,
    subject: `Invoice ${r.invoiceNumber} — ${r.patientName}${r.gopRef ? ` (${r.gopRef})` : ""}`,
    text: [
      "Dear colleagues,",
      "",
      `Please find our invoice ${r.invoiceNumber} for your insured ${r.patientName}${r.dateOfBirth ? ` (born ${r.dateOfBirth})` : ""}${r.policyNumber ? `, policy ${r.policyNumber}` : ""}, under your guarantee ${r.gopRef ?? "(reference to follow)"}.`,
      `Amount: ${money(Number(r.amount), r.currency)}. Attached: the itemised invoice${r.attachments.length ? `, ${r.attachments.join(", ")}` : ""}.`,
      "Payment within 30 days, please, quoting the invoice number.",
      "",
      `Kind regards,\n${r.facility} — international billing`,
    ].join("\n"),
    automatic: false,
  });
  return prisma.receivable.update({
    where: { id: r.id },
    data: {
      status: "SUBMITTED",
      submittedAt: now,
      dueAt: new Date(`${addDays(zonedToday(), 30)}T21:00:00Z`),
      readiness: readiness as unknown as Prisma.InputJsonValue,
      chases: [...chasesOf(r), { at: now.toISOString(), channel: "EMAIL", outcome: "Invoice sent", by }] as unknown as Prisma.InputJsonValue,
    },
  });
}

/** A polite reminder by e-mail, quoting everything the payer needs to find it. */
export async function chaseByEmail(ref: string, by: string) {
  const r = await byRef(ref);
  if (!OPEN_RECEIVABLE.includes(r.status)) throw conflict(`${r.ref} isn't waiting for payment.`);
  if (!r.payerEmail) throw badRequest("The payer has no e-mail address on file.");
  const days = daysOutstanding(r) ?? 0;
  await sendEmail({
    to: `${r.payerName} <${r.payerEmail}>`,
    subject: `Payment reminder: invoice ${r.invoiceNumber} — ${r.patientName}`,
    text: [
      "Dear colleagues,",
      "",
      `Our invoice ${r.invoiceNumber} for ${r.patientName}${r.policyNumber ? ` (policy ${r.policyNumber})` : ""}, guarantee ${r.gopRef ?? "—"}, for ${money(balance(r), r.currency)}, was sent ${days} days ago and is still open.`,
      "Could you tell us its status and the expected payment date? If anything is missing, reply to this e-mail and we will send it today.",
      "",
      `Kind regards,\n${r.facility} — international billing`,
    ].join("\n"),
    automatic: false,
  });
  return prisma.receivable.update({
    where: { id: r.id },
    data: { chases: [...chasesOf(r), { at: new Date().toISOString(), channel: "EMAIL", outcome: "Reminder sent", by }] as unknown as Prisma.InputJsonValue },
  });
}

/** Records a payment: paid in full, or part-paid with the balance still open. */
export async function recordPayment(ref: string, amount: number, by: string) {
  const r = await byRef(ref);
  if (!(amount > 0)) throw badRequest("Enter the amount received.");
  const paid = round2(Number(r.paidAmount) + amount);
  const full = paid >= Number(r.amount) - 0.005;
  if (full) emit("receivable.paid", { ref: r.ref, invoice: r.invoiceNumber, payer: r.payerName, amount: Number(r.amount), currency: r.currency, paidAt: new Date().toISOString() });
  return prisma.receivable.update({
    where: { id: r.id },
    data: {
      paidAmount: paid,
      status: full ? "PAID" : "PARTIALLY_PAID",
      paidAt: full ? new Date() : r.paidAt,
      chases: [...chasesOf(r), { at: new Date().toISOString(), channel: "EMAIL", outcome: `Payment received: ${money(amount, r.currency)}`, by }] as unknown as Prisma.InputJsonValue,
    },
  });
}

export type PayerStatus = "NOT_RECEIVED" | "IN_REVIEW" | "APPROVED" | "PAYMENT_SCHEDULED" | "PAID" | "DISPUTED";

/** The payer's answer on a follow-up call, from the voice agent. */
export async function recordPayerAnswer(
  ref: string,
  answer: { status: PayerStatus; expectedPaymentDate?: string | null; approvedAmount?: number | null; missing?: string[]; payerRef?: string | null; contact?: string | null; notes?: string | null },
  by: string,
  callRef?: string | null
) {
  const r = await byRef(ref);
  const status: ReceivableStatus =
    answer.status === "DISPUTED"
      ? "DISPUTED"
      : answer.status === "APPROVED" || answer.status === "PAYMENT_SCHEDULED"
        ? "APPROVED"
        : answer.status === "IN_REVIEW"
          ? "ACKNOWLEDGED"
          : r.status;
  const said = [
    answer.status.replace(/_/g, " ").toLowerCase(),
    answer.expectedPaymentDate ? `payment expected ${answer.expectedPaymentDate}` : null,
    answer.missing?.length ? `missing: ${answer.missing.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  return prisma.receivable.update({
    where: { id: r.id },
    data: {
      status,
      payerAnswer: { ...answer, at: new Date().toISOString() } as unknown as Prisma.InputJsonValue,
      chases: [...chasesOf(r), { at: new Date().toISOString(), channel: "PHONE", outcome: `Payer said: ${said}`, note: answer.notes ?? null, by, callRef: callRef ?? null }] as unknown as Prisma.InputJsonValue,
    },
  });
}

/** The invoice a follow-up call is about: the one given, else the longest-waiting open one. */
export async function receivableToChase(ref?: string | null): Promise<Receivable | null> {
  if (ref) return prisma.receivable.findFirst({ where: { OR: [{ id: ref }, { ref: ref.toUpperCase() }] } });
  return prisma.receivable.findFirst({
    where: { status: { in: ["SUBMITTED", "ACKNOWLEDGED"] }, payerPhone: { not: null } },
    orderBy: { submittedAt: "asc" },
  });
}
