import { fromEur, round2, toEur } from "@/lib/fx";
import { PRICE_TOLERANCE, TARIFF_VERSION, isNonMedical, stayNorm, tariffFor } from "./tariff";

// ---------------------------------------------------------------------------
// AI medical bill review, as a pure function: the model reads the invoice's
// lines; these rules (not the model) decide what is reasonable. Every change
// carries a plain-language reason, and nothing is applied until a person
// accepts it. Before treatment (a cost estimate) price findings are advice
// only: a guarantee is never cut on price, or the hospital would ask the
// traveller for a deposit.
// ---------------------------------------------------------------------------

export interface BillLine {
  code: string | null;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
}

export type FindingRule = "DUPLICATE" | "NON_MEDICAL" | "EXTRA_NIGHTS" | "PRICE_ABOVE_REFERENCE" | "ARITHMETIC" | "TOTAL_MISMATCH" | "NO_REFERENCE";

export interface BillFinding {
  /** Index into the lines, or null for the bill as a whole. */
  line: number | null;
  rule: FindingRule;
  reason: string;
  /** How much this finding takes off (0 for a query). */
  saving: number;
}

export interface ReviewedLine extends BillLine {
  billed: number;
  recommended: number;
  /** Covered at all (false for comfort items and duplicates). */
  covered: boolean;
}

export interface BillReviewInput {
  kind: "HOSPITAL_INVOICE" | "COST_ESTIMATE";
  lines: BillLine[];
  /** The total printed on the document, if any. */
  total: number | null;
  currency: string;
  diagnosis: string | null;
  admissionDate: string | null;
  dischargeDate: string | null;
}

export interface BillReviewResult {
  ruleset: string;
  currency: string;
  billed: number;
  recommended: number;
  savings: number;
  savingsEur: number | null;
  /** Of the savings, what isn't covered at all (comfort items, duplicates): deducted even before treatment. */
  notCovered: number;
  lines: ReviewedLine[];
  findings: BillFinding[];
  /** Nights the review allowed, and why. */
  stay: { nights: number | null; basis: "dates" | "norm" | null };
}

const PER = { item: "each", night: "a night", session: "a session" } as const;

const money = (n: number, ccy: string) => `${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`;

function nightsBetween(from: string | null, to: string | null): number | null {
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  return days >= 0 ? days : null;
}

/** A line's billed amount: as printed, else quantity × price. */
const billedOf = (l: BillLine) => l.amount ?? (l.quantity != null && l.unitPrice != null ? l.quantity * l.unitPrice : 0);

export function reviewBill(input: BillReviewInput): BillReviewResult {
  const { currency } = input;
  const findings: BillFinding[] = [];

  const byDates = nightsBetween(input.admissionDate, input.dischargeDate);
  const norm = stayNorm(input.diagnosis);
  const stay = byDates != null ? { nights: byDates, basis: "dates" as const } : norm != null ? { nights: norm, basis: "norm" as const } : { nights: null, basis: null };
  // Room nights left to allow across all room lines.
  let nightsLeft = stay.nights;

  const seen = new Map<string, number>();
  const lines: ReviewedLine[] = input.lines.map((l, i) => {
    const billed = round2(billedOf(l));
    const out: ReviewedLine = { ...l, billed, recommended: billed, covered: true };
    const cut = (rule: FindingRule, reason: string, to: number) => {
      const saving = round2(out.recommended - to);
      if (saving <= 0) return;
      out.recommended = round2(to);
      findings.push({ line: i, rule, reason, saving });
    };

    if (l.quantity != null && l.unitPrice != null && l.amount != null && Math.abs(l.quantity * l.unitPrice - l.amount) > 0.01) {
      findings.push({
        line: i,
        rule: "ARITHMETIC",
        reason: `Charged ${money(l.amount, currency)}, but ${l.quantity} × ${money(l.unitPrice, currency)} is ${money(l.quantity * l.unitPrice, currency)}.`,
        saving: 0,
      });
      out.recommended = round2(Math.min(l.amount, l.quantity * l.unitPrice));
    }

    const key = `${l.code ?? ""}|${l.description.trim().toLowerCase()}|${billed}`;
    const first = seen.get(key);
    if (first != null) {
      out.covered = false;
      cut("DUPLICATE", `Same charge as line ${first + 1}: billed twice.`, 0);
      return out;
    }
    seen.set(key, i);

    const entry = tariffFor(l.code, l.description);
    if (entry?.category === "NON_MEDICAL" || isNonMedical(l.description)) {
      out.covered = false;
      cut("NON_MEDICAL", "Comfort or convenience item, not medical treatment: not covered.", 0);
      return out;
    }

    let quantity = l.quantity ?? 1;
    if (entry?.unit === "night" && nightsLeft != null) {
      const allowed = Math.max(0, Math.min(quantity, nightsLeft));
      nightsLeft -= allowed;
      if (allowed < quantity) {
        const why =
          stay.basis === "dates"
            ? `the stay was ${stay.nights} night${stay.nights === 1 ? "" : "s"} (${input.admissionDate} to ${input.dischargeDate})`
            : `the usual stay for this diagnosis is ${stay.nights} night${stay.nights === 1 ? "" : "s"}`;
        const unit = l.unitPrice ?? (quantity > 0 ? out.recommended / quantity : 0);
        cut("EXTRA_NIGHTS", `${quantity} nights billed, but ${why}.`, allowed * unit);
        quantity = allowed;
      }
    }

    if (!entry || entry.eur == null) {
      if (!entry) findings.push({ line: i, rule: "NO_REFERENCE", reason: "No reference price for this item: check it by hand.", saving: 0 });
      return out;
    }
    const capUnit = fromEur(entry.eur * PRICE_TOLERANCE, currency);
    const refUnit = fromEur(entry.eur, currency);
    const unit = l.unitPrice ?? (quantity > 0 ? out.recommended / quantity : null);
    if (capUnit != null && refUnit != null && unit != null && unit > capUnit + 0.005) {
      cut(
        "PRICE_ABOVE_REFERENCE",
        `Billed ${money(unit, currency)} ${PER[entry.unit]}; the reference is ${money(round2(refUnit), currency)}, and up to ${money(round2(capUnit), currency)} is accepted.`,
        quantity * capUnit
      );
    }
    return out;
  });

  const billed = round2(lines.reduce((s, l) => s + l.billed, 0));
  if (input.total != null && Math.abs(input.total - billed) > 0.01) {
    findings.push({
      line: null,
      rule: "TOTAL_MISMATCH",
      reason: `The lines add up to ${money(billed, currency)}, but the total says ${money(input.total, currency)}.`,
      saving: 0,
    });
  }

  const recommended = round2(lines.reduce((s, l) => s + l.recommended, 0));
  const savings = round2(billed - recommended);
  const notCovered = round2(lines.filter((l) => !l.covered).reduce((s, l) => s + l.billed, 0));
  const eur = toEur(savings, currency);
  return {
    ruleset: TARIFF_VERSION,
    currency,
    billed,
    recommended,
    savings,
    savingsEur: eur == null ? null : round2(eur),
    notCovered,
    lines,
    findings,
    stay,
  };
}
