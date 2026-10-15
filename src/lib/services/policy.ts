import { prisma } from "@/lib/db";

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

/**
 * Coverage for a benefit after verifying the caller: the policy number must
 * exist and the date of birth must match the policyholder's.
 */
export async function checkCoverage(input: {
  policyNumber: string;
  dateOfBirth: string;
  benefit?: string | null;
}): Promise<CoverageResult> {
  const number = input.policyNumber.trim().toUpperCase().replace(/\s+/g, "");
  const policy = await prisma.policy.findUnique({ where: { number }, include: { patient: true } });
  const dob = policy?.patient?.dateOfBirth.toISOString().slice(0, 10);
  if (!policy || !policy.patient || dob !== input.dateOfBirth.trim()) {
    return {
      verified: false,
      reason: "The policy number and date of birth don't match our records.",
    };
  }
  const benefits = policy.benefits as unknown as Benefit[];
  const code = input.benefit ? resolveBenefit(input.benefit) : null;
  const benefit = code ? (benefits.find((b) => b.code === code) ?? null) : null;
  const now = new Date();
  return {
    verified: true,
    policyNumber: policy.number,
    plan: policy.plan,
    holder: `${policy.patient.firstName} ${policy.patient.lastName}`,
    validOnToday: policy.validFrom <= now && now <= policy.validTo,
    validTo: policy.validTo.toISOString().slice(0, 10),
    currency: policy.currency,
    medicalLimitRemaining: Number(policy.medicalLimit) - Number(policy.medicalUsed),
    benefit,
    ...(benefit ? {} : { otherBenefits: benefits.map((b) => ({ code: b.code, label: b.label, covered: b.covered })) }),
    caveat: CAVEAT,
  };
}
