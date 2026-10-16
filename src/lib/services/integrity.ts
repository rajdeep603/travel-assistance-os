// ---------------------------------------------------------------------------
// Integrity checks on a claim (fraud, waste and abuse), as a pure function.
// Each signal says what was seen and why it matters; none decides anything.
// A person refers the claim to the fraud team or clears it. Signals are
// internal: they never go into Claim.issues, which claimants see.
// ---------------------------------------------------------------------------

export type SignalCode =
  | "OUTSIDE_POLICY"
  | "POLICY_NEW"
  | "DUPLICATE_INVOICE"
  | "DATES_INCONSISTENT"
  | "IDENTITY_MISMATCH"
  | "LINES_DONT_ADD_UP"
  | "BANK_CHANGE";

export interface IntegritySignal {
  code: SignalCode;
  reason: string;
}

export interface IntegrityDocument {
  filename: string;
  documentNumber: string | null;
  patientName: string | null;
  dateOfBirth: string | null;
  admissionDate: string | null;
  dischargeDate: string | null;
  invoiceAmount: number | null;
  currency: string | null;
  /** Sum of the invoice's lines, when it has any. */
  lineSum: number | null;
}

export interface IntegrityInput {
  policy: { validFrom: Date; validTo: Date } | null;
  holder: { firstName: string; lastName: string; dateOfBirth: string };
  documents: IntegrityDocument[];
  /** The same invoice number on other claims. */
  duplicates: { documentNumber: string; claimRef: string }[];
  /** Inbound messages on the case flagged for a change of bank details. */
  bankChangeMessages: string[];
}

/** Days a new policy must have run before treatment, below which onset is checked. */
export const NEW_POLICY_DAYS = 7;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

function samePerson(name: string, holder: IntegrityInput["holder"]): boolean {
  const words = new Set(fold(name));
  return [holder.firstName, ...fold(holder.lastName)].every((w) => words.has(fold(w)[0] ?? w));
}

export function integritySignals(input: IntegrityInput): IntegritySignal[] {
  const out: IntegritySignal[] = [];
  const seen = new Set<string>();
  const add = (code: SignalCode, reason: string) => {
    if (seen.has(reason)) return;
    seen.add(reason);
    out.push({ code, reason });
  };

  const admissions = input.documents.map((d) => d.admissionDate).filter((d): d is string => !!d && ISO.test(d));
  const first = admissions.sort()[0];
  if (input.policy && first) {
    const t = day(first);
    if (t < input.policy.validFrom.getTime() || t > input.policy.validTo.getTime()) {
      add("OUTSIDE_POLICY", `Treatment on ${first} is outside the policy's dates (${fmt(input.policy.validFrom)} to ${fmt(input.policy.validTo)}).`);
    } else {
      const days = Math.floor((t - input.policy.validFrom.getTime()) / 86_400_000);
      if (days < NEW_POLICY_DAYS) {
        add("POLICY_NEW", `The policy started ${days} day${days === 1 ? "" : "s"} before treatment: check when the condition began.`);
      }
    }
  }

  for (const d of input.documents) {
    if (d.admissionDate && d.dischargeDate && ISO.test(d.admissionDate) && ISO.test(d.dischargeDate) && day(d.dischargeDate) < day(d.admissionDate)) {
      add("DATES_INCONSISTENT", `${d.filename}: discharge (${d.dischargeDate}) is before admission (${d.admissionDate}).`);
    }
    if (d.patientName && !samePerson(d.patientName, input.holder)) {
      add("IDENTITY_MISMATCH", `${d.filename} names ${d.patientName}, but the policyholder is ${input.holder.firstName} ${input.holder.lastName}.`);
    }
    if (d.dateOfBirth && ISO.test(d.dateOfBirth) && d.dateOfBirth !== input.holder.dateOfBirth) {
      add("IDENTITY_MISMATCH", `${d.filename} gives date of birth ${d.dateOfBirth}; the policyholder was born ${input.holder.dateOfBirth}.`);
    }
    if (d.lineSum != null && d.invoiceAmount != null && Math.abs(d.lineSum - d.invoiceAmount) > 0.01) {
      add("LINES_DONT_ADD_UP", `${d.filename}: the lines add up to ${d.lineSum.toFixed(2)} ${d.currency ?? ""}, but the total says ${d.invoiceAmount.toFixed(2)}.`.replace("  ", " "));
    }
  }

  for (const dup of input.duplicates) {
    add("DUPLICATE_INVOICE", `Invoice ${dup.documentNumber} is also on claim ${dup.claimRef}: possible duplicate claim.`);
  }
  for (const ref of input.bankChangeMessages) {
    add("BANK_CHANGE", `Message ${ref} on this case asks to change bank details: confirm by phone before paying.`);
  }
  return out;
}
