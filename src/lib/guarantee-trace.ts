import { formatDate, formatMoney } from "@/lib/format";

// ---------------------------------------------------------------------------
// Explains a Letter of Guarantee decision in plain steps, from the trace the
// rules engine stores (src/lib/services/guarantee-decision.ts). Pure, so the
// case page and tests share it.
// ---------------------------------------------------------------------------

interface Trace {
  estimate?: { amount?: number; currency?: string };
  autoApproveLimitEur?: number;
  policy?: { number?: string; plan?: string; validFrom?: string; validTo?: string } | null;
  benefit?: { covered?: boolean; limit?: number | null; excess?: number } | null;
  computation?: {
    estimateEur?: number;
    remainingMedicalLimitEur?: number;
    benefitLimitEur?: number | null;
    excessEur?: number;
    guaranteedEur?: number;
  };
}

const eur = (n: number) => formatMoney(n, "EUR");

/** Numbered-list sentences: policy → benefit → estimate → limits → amount → approval. */
export function describeGuaranteeDecision(raw: unknown, flags: string[] = []): string[] {
  const t = (raw && typeof raw === "object" ? raw : {}) as Trace;
  const steps: string[] = [];

  if (!t.policy) {
    steps.push("No policy was found for this patient, so nothing can be guaranteed automatically.");
  } else {
    const validity =
      t.policy.validFrom && t.policy.validTo ? `, valid ${formatDate(t.policy.validFrom)} – ${formatDate(t.policy.validTo)}` : "";
    steps.push(`Policy ${t.policy.number ?? ""} (${t.policy.plan ?? "plan"})${validity}.`);
  }

  if (t.policy) {
    if (!t.benefit?.covered) steps.push("Hospital admission is not covered by this plan.");
    else steps.push("Hospital admission is covered by this plan.");
  }

  const c = t.computation;
  const estimate = t.estimate;
  if (c?.estimateEur != null) {
    const original =
      estimate?.amount != null && estimate.currency && estimate.currency !== "EUR"
        ? ` (${formatMoney(estimate.amount, estimate.currency)})`
        : "";
    steps.push(`The hospital's estimate is ${eur(c.estimateEur)}${original}.`);
    const limits = [`remaining medical limit ${eur(c.remainingMedicalLimitEur ?? 0)}`];
    if (c.benefitLimitEur != null) limits.push(`hospital benefit limit ${eur(c.benefitLimitEur)}`);
    steps.push(`Limits that apply: ${limits.join(", ")}.`);
    const excess = c.excessEur ? `, minus the ${eur(c.excessEur)} excess` : "";
    steps.push(`Guaranteed amount: the lower of the estimate and the limits${excess} = ${eur(c.guaranteedEur ?? 0)}.`);
  }

  if (flags.length) {
    steps.push(`Needs a person's approval: ${flags.map((f) => f.charAt(0).toLowerCase() + f.slice(1)).join("; ")}.`);
  } else if (c?.guaranteedEur != null && t.autoApproveLimitEur != null) {
    steps.push(
      `${eur(c.guaranteedEur)} is within the automatic approval limit of ${eur(t.autoApproveLimitEur)}, so it was approved automatically.`
    );
  }
  return steps;
}
