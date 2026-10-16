import { prisma } from "@/lib/db";
import { committedGuarantees } from "./exposure";

// ---------------------------------------------------------------------------
// PolicyService: what a traveller's policy covers. Answers are computed from
// the policy record, never generated — the AI only phrases them. Every answer
// carries the caveat that the claims team makes the final decision.
// ---------------------------------------------------------------------------

export interface Benefit {
  code: string;
  label: string;
  covered: boolean;
  limit: number | null;
  unit?: string;
  excess: number;
  waitingHours?: number;
  conditions: string[];
}

export const BENEFIT_CODES = [
  "MEDICAL_EXPENSES",
  "HOSPITALIZATION",
  "EMERGENCY_DENTAL",
  "MEDICAL_EVACUATION",
  "REPATRIATION",
  "TRIP_DELAY",
  "BAGGAGE_DELAY",
  "TRIP_CANCELLATION",
  "PRE_EXISTING_CONDITIONS",
] as const;
export type BenefitCode = (typeof BENEFIT_CODES)[number];

const KEYWORDS: [BenefitCode, RegExp][] = [
  ["TRIP_DELAY", /\b(flight|train|trip|travel|departure)\b.*\b(delay|late|missed)|\bdelay(ed)?\b.*\b(flight|train)|missed connection/i],
  ["BAGGAGE_DELAY", /\b(baggage|luggage|suitcase|bag)\b/i],
  ["TRIP_CANCELLATION", /\bcancel/i],
  ["EMERGENCY_DENTAL", /\b(dental|dentist|tooth|teeth)\b/i],
  ["MEDICAL_EVACUATION", /\bevacuat/i],
  ["REPATRIATION", /\brepatriat|fly (me|him|her|them) home\b/i],
  ["PRE_EXISTING_CONDITIONS", /\bpre-?existing|chronic|already had\b/i],
  ["HOSPITALIZATION", /\bhospital(i[sz]ation)?|admit|admission|surgery|operation\b/i],
  ["MEDICAL_EXPENSES", /\bdoctor|clinic|medical|treatment|medicine|consultation|emergency\b/i],
];

/** Maps a benefit code or a phrase ("is my flight delay covered?") to a benefit. */
export function resolveBenefit(text: string): BenefitCode | null {
  const upper = text.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if ((BENEFIT_CODES as readonly string[]).includes(upper)) return upper as BenefitCode;
  for (const [code, re] of KEYWORDS) if (re.test(text)) return code;
  return null;
}

export type CoverageResult =
  | { verified: false; reason: string }
  | {
      verified: true;
      policyNumber: string;
      plan: string;
      holder: string;
      validOnToday: boolean;
      validTo: string;
      currency: string;
      medicalLimitRemaining: number;
      benefit: Benefit | null;
      otherBenefits?: { code: string; label: string; covered: boolean }[];
      caveat: string;
    };

const CAVEAT = "This is general policy information; the claims team makes the final decision on any claim.";

const alphanumeric = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const digitsOf = (s: string) => s.replace(/\D/g, "");

/**
 * Finds the policy a caller means. Spoken numbers lose their dashes
 * ("POLTR100945") and the letters are often misheard ("P O L E R"), so this
 * matches letters and digits, then the digits alone. The date of birth must
 * match the policyholder's either way.
 */
async function findPolicyForCaller(policyNumber: string, dateOfBirth: string) {
  const digits = digitsOf(policyNumber);
  if (digits.length < 5) return null;
  const candidates = await prisma.policy.findMany({
    where: { number: { endsWith: digits } },
    include: { patient: true },
  });
  const dobMatches = (p: (typeof candidates)[number]) =>
    p.patient?.dateOfBirth.toISOString().slice(0, 10) === dateOfBirth.trim();
  const wanted = alphanumeric(policyNumber);
  return (
    candidates.find((p) => alphanumeric(p.number) === wanted && dobMatches(p)) ??
    candidates.find((p) => digitsOf(p.number) === digits && dobMatches(p)) ??
    null
  );
}

/**
 * Coverage for a benefit after verifying the caller: the policy number must
 * exist and the date of birth must match the policyholder's.
 */
export async function checkCoverage(input: {
  policyNumber: string;
  dateOfBirth: string;
  benefit?: string | null;
}): Promise<CoverageResult> {
  const policy = await findPolicyForCaller(input.policyNumber, input.dateOfBirth);
  if (!policy || !policy.patient) {
    return {
      verified: false,
      reason: "The policy number and date of birth don't match our records.",
    };
  }
  const benefits = policy.benefits as unknown as Benefit[];
  const code = input.benefit ? resolveBenefit(input.benefit) : null;
  const benefit = code ? (benefits.find((b) => b.code === code) ?? null) : null;
  const now = new Date();
  // What's left after open guarantees, not just after what has been paid.
  const committed = await committedGuarantees(policy.patient.id, policy.currency, { now });
  return {
    verified: true,
    policyNumber: policy.number,
    plan: policy.plan,
    holder: `${policy.patient.firstName} ${policy.patient.lastName}`,
    validOnToday: policy.validFrom <= now && now <= policy.validTo,
    validTo: policy.validTo.toISOString().slice(0, 10),
    currency: policy.currency,
    medicalLimitRemaining: Math.max(0, Number(policy.medicalLimit) - Number(policy.medicalUsed) - committed.total),
    benefit,
    ...(benefit ? {} : { otherBenefits: benefits.map((b) => ({ code: b.code, label: b.label, covered: b.covered })) }),
    caveat: CAVEAT,
  };
}
