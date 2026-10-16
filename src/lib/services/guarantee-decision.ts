import { fromEur, round2, toEur } from "@/lib/fx";
import type { Benefit } from "./policy";

// ---------------------------------------------------------------------------
// The Letter of Guarantee decision, as a pure function: same inputs, same
// answer, every step written to the trace. The language model only reads the
// cost estimate; it never decides whether or how much to guarantee.
// ---------------------------------------------------------------------------

export interface GuaranteeInputs {
  estimate: {
    amount: number;
    currency: string;
    diagnosis: string | null;
    treatment: string[];
    admissionDate: string | null;
    /** Bill review of the estimate: lines never covered (comfort items, duplicates) are taken off; the price review is advice. */
    review?: { notCovered: number; recommended: number; ruleset: string } | null;
  };
  policy: {
    number: string;
    plan: string;
    validFrom: Date;
    validTo: Date;
    currency: string;
    medicalLimit: number;
    medicalUsed: number;
    /** Open guarantees already issued on this policy, in the policy's currency. */
    committed?: number;
    benefits: Benefit[];
  } | null;
  /** EUR amount up to which no human approval is needed. */
  autoApproveLimitEur: number;
  /** Date of treatment (defaults to today). */
  on: Date;
}

export interface GuaranteeDecision {
  guaranteedAmount: number; // in the estimate's currency
  excess: number; // in the estimate's currency
  conditions: string[];
  /** Why a human must decide. Empty = can be approved automatically. */
  flags: string[];
  autoApprove: boolean;
  trace: Record<string, unknown>;
}

const PRE_EXISTING = /\b(known|history of|chronic|pre-?existing|previously diagnosed|recurrent|since \d{4})\b/i;

export function decideGuarantee(input: GuaranteeInputs): GuaranteeDecision {
  const { estimate, policy } = input;
  const flags: string[] = [];
  const trace: Record<string, unknown> = {
    estimate,
    ruleset: "demo-guarantee-v1",
    autoApproveLimitEur: input.autoApproveLimitEur,
  };
  const conditions = [
    "Covers medically necessary treatment for the condition stated, during the validity period.",
    "Final invoice to be itemised and accompanied by the medical report and discharge summary.",
    "Non-medical expenses (telephone, companion meals, upgrades) are not covered.",
  ];

  if (!policy) {
    flags.push("No policy found for this patient");
    return { guaranteedAmount: 0, excess: 0, conditions, flags, autoApprove: false, trace: { ...trace, policy: null } };
  }
  trace.policy = { number: policy.number, plan: policy.plan, validFrom: policy.validFrom, validTo: policy.validTo };

  if (input.on < policy.validFrom || input.on > policy.validTo) flags.push("Policy not valid on the treatment date");

  const benefit = policy.benefits.find((b) => b.code === "HOSPITALIZATION");
  trace.benefit = benefit ?? null;
  if (!benefit?.covered) flags.push("Hospital admission is not covered by the plan");

  const notCovered = Math.min(estimate.amount, Math.max(0, estimate.review?.notCovered ?? 0));
  const estimateEur = toEur(estimate.amount - notCovered, estimate.currency);
  if (estimateEur == null) {
    flags.push(`No exchange rate for ${estimate.currency}`);
    return { guaranteedAmount: 0, excess: 0, conditions, flags, autoApprove: false, trace };
  }
  const committed = Math.max(0, policy.committed ?? 0);
  const remainingEur = Math.max(0, toEur(policy.medicalLimit - policy.medicalUsed - committed, policy.currency) ?? 0);
  const benefitLimitEur = benefit?.limit != null ? (toEur(benefit.limit, policy.currency) ?? Infinity) : Infinity;
  const excessEur = toEur(benefit?.excess ?? 0, policy.currency) ?? 0;
  const capEur = Math.min(remainingEur, benefitLimitEur);
  const guaranteedEur = Math.max(0, Math.min(estimateEur, capEur) - excessEur);
  trace.computation = {
    estimateEur: round2(estimateEur),
    remainingMedicalLimitEur: round2(remainingEur),
    benefitLimitEur: Number.isFinite(benefitLimitEur) ? round2(benefitLimitEur) : null,
    excessEur: round2(excessEur),
    guaranteedEur: round2(guaranteedEur),
    rule: "guaranteed = min(estimate, remaining limit, benefit limit) − excess",
    // Present only when they apply, so older traces read the same.
    ...(committed > 0 ? { committedGuaranteesEur: round2(toEur(committed, policy.currency) ?? 0) } : {}),
    ...(notCovered > 0 ? { notCoveredEur: round2(toEur(notCovered, estimate.currency) ?? 0) } : {}),
    ...(estimate.review && estimate.review.recommended < estimate.amount
      ? { reviewedEur: round2(toEur(estimate.review.recommended, estimate.currency) ?? 0), reviewRuleset: estimate.review.ruleset }
      : {}),
  };
  if (estimateEur > capEur) {
    flags.push("Estimate exceeds the remaining medical limit");
    conditions.push("Costs above the guaranteed amount are payable by the patient unless a further guarantee is issued.");
  }
  if (excessEur > 0) conditions.push(`An excess of ${round2(fromEur(excessEur, estimate.currency) ?? 0)} ${estimate.currency} is payable by the patient.`);

  const clinical = [estimate.diagnosis ?? "", ...estimate.treatment].join(" ");
  const preExistingCovered = policy.benefits.find((b) => b.code === "PRE_EXISTING_CONDITIONS")?.covered ?? false;
  if (PRE_EXISTING.test(clinical)) {
    if (preExistingCovered) conditions.push("Treatment of a possibly pre-existing condition: covered under the plan's pre-existing conditions benefit.");
    else flags.push("Possible pre-existing condition (not covered by the plan)");
  }

  if (guaranteedEur > input.autoApproveLimitEur) flags.push(`Above the automatic approval limit (EUR ${input.autoApproveLimitEur.toLocaleString("en-GB")})`);
  if (guaranteedEur <= 0) flags.push("Nothing can be guaranteed under this policy");

  const toEstimateCurrency = (eur: number) => round2(fromEur(eur, estimate.currency) ?? 0);
  return {
    guaranteedAmount: toEstimateCurrency(guaranteedEur),
    excess: toEstimateCurrency(excessEur),
    conditions,
    flags,
    autoApprove: flags.length === 0,
    trace,
  };
}
