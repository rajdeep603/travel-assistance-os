import { describe, expect, it } from "vitest";
import { checkCompleteness } from "@/lib/services/claims";
import { integritySignals, type IntegrityInput } from "@/lib/services/integrity";
import { convert } from "@/lib/services/exposure";
import { decideGuarantee } from "@/lib/services/guarantee-decision";
import { describeGuaranteeDecision } from "@/lib/guarantee-trace";
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_COST_CONTAINMENT,
  DEFAULT_INPUTS,
  buildSummary,
  calculateBusinessCase,
  calculateCostContainment,
  withCostContainment,
} from "@/lib/business-case";

const doc = (patch: Partial<IntegrityInput["documents"][number]> = {}): IntegrityInput["documents"][number] => ({
  filename: "invoice.pdf",
  documentNumber: "INV-1",
  patientName: "Aylin Yilmaz",
  dateOfBirth: "1987-03-14",
  admissionDate: "2026-09-18",
  dischargeDate: "2026-09-20",
  invoiceAmount: 100,
  currency: "EUR",
  lineSum: 100,
  ...patch,
});

const base = (patch: Partial<IntegrityInput> = {}): IntegrityInput => ({
  policy: { validFrom: new Date("2026-08-01T00:00:00Z"), validTo: new Date("2027-07-31T00:00:00Z") },
  holder: { firstName: "Aylin", lastName: "Yilmaz", dateOfBirth: "1987-03-14" },
  documents: [doc()],
  duplicates: [],
  bankChangeMessages: [],
  ...patch,
});

describe("integrity signals", () => {
  it("raises nothing on a clean claim", () => {
    expect(integritySignals(base())).toEqual([]);
  });

  it("checks treatment against the policy dates", () => {
    expect(integritySignals(base({ documents: [doc({ admissionDate: "2026-07-20", dischargeDate: "2026-07-22" })] }))[0]).toMatchObject({
      code: "OUTSIDE_POLICY",
      reason: "Treatment on 2026-07-20 is outside the policy's dates (2026-08-01 to 2027-07-31).",
    });
    expect(integritySignals(base({ documents: [doc({ admissionDate: "2026-08-03", dischargeDate: "2026-08-04" })] }))[0]).toMatchObject({
      code: "POLICY_NEW",
      reason: "The policy started 2 days before treatment: check when the condition began.",
    });
  });

  it("spots inconsistent documents and identity", () => {
    const codes = integritySignals(
      base({
        documents: [
          doc({ admissionDate: "2026-09-20", dischargeDate: "2026-09-18" }),
          doc({ filename: "report.pdf", patientName: "Ayla Yildiz", dateOfBirth: "1990-01-01" }),
          doc({ filename: "bill.pdf", lineSum: 90 }),
        ],
      })
    ).map((s) => s.code);
    expect(codes).toEqual(["DATES_INCONSISTENT", "IDENTITY_MISMATCH", "IDENTITY_MISMATCH", "LINES_DONT_ADD_UP"]);
  });

  it("matches names regardless of accents, case and Turkish letters", () => {
    expect(integritySignals(base({ documents: [doc({ patientName: "AYLIN YILMAZ" })] }))).toEqual([]);
    expect(integritySignals(base({ documents: [doc({ patientName: "Aylin Yılmaz" })] }))).toEqual([]);
  });

  it("names duplicate invoices and bank-detail changes", () => {
    const s = integritySignals(base({ duplicates: [{ documentNumber: "INV-1", claimRef: "CLM-10245" }], bankChangeMessages: ["MSG-0911"] }));
    expect(s.map((x) => x.reason)).toEqual([
      "Invoice INV-1 is also on claim CLM-10245: possible duplicate claim.",
      "Message MSG-0911 on this case asks to change bank details: confirm by phone before paying.",
    ]);
  });
});

describe("claim authority limits", () => {
  const claim = (kinds: string[], invoice: { amount: number; currency: string }, discharge = false) =>
    ({
      id: "c1",
      ref: "CLM-TEST",
      amount: null,
      currency: null,
      documents: kinds.map((kind, i) => ({
        id: `d${i}`,
        filename: `${kind}.pdf`,
        kind,
        status: "PROCESSED",
        extraction: {
          policyReference: "POL-TR-1",
          invoiceAmount: kind === "HOSPITAL_INVOICE" ? invoice.amount : null,
          currency: kind === "HOSPITAL_INVOICE" ? invoice.currency : null,
          dischargeDate: discharge ? "2026-09-20" : null,
        },
      })),
    }) as unknown as Parameters<typeof checkCompleteness>[0];

  it("sends large outpatient claims to a senior reviewer", () => {
    const issues = checkCompleteness(claim(["MEDICAL_REPORT", "HOSPITAL_INVOICE"], { amount: 800, currency: "EUR" }));
    expect(issues.find((i) => i.message.startsWith("Above the outpatient limit"))).toEqual({
      severity: "warning",
      message: "Above the outpatient limit of 20,000 TRY: a senior reviewer decides",
    });
  });

  it("uses the higher inpatient limit for a hospital stay", () => {
    const issues = checkCompleteness(claim(["MEDICAL_REPORT", "HOSPITAL_INVOICE", "DISCHARGE_SUMMARY"], { amount: 25250, currency: "TRY" }, true));
    expect(issues.some((i) => i.message.includes("limit of"))).toBe(false);
  });
});

describe("guarantee limits with open guarantees", () => {
  const policy = {
    number: "POL-1",
    plan: "Essential",
    validFrom: new Date("2026-08-01"),
    validTo: new Date("2027-08-01"),
    currency: "EUR",
    medicalLimit: 50000,
    medicalUsed: 1850,
    benefits: [{ code: "HOSPITALIZATION", label: "Hospital", covered: true, limit: 50000, unit: "EUR", excess: 100, conditions: [] }],
  };
  const estimate = { amount: 40000, currency: "EUR", diagnosis: "Unstable angina", treatment: [], admissionDate: null };

  it("takes committed guarantees off the remaining limit", () => {
    const d = decideGuarantee({ estimate, policy: { ...policy, committed: 11850 }, autoApproveLimitEur: 10000, on: new Date("2026-10-16") });
    expect(d.guaranteedAmount).toBe(36200);
    expect(d.flags).toContain("Estimate exceeds the remaining medical limit");
  });

  it("deducts never-covered lines from an estimate and keeps price findings as advice", () => {
    const d = decideGuarantee({
      estimate: { ...estimate, amount: 7000, review: { notCovered: 900, recommended: 5200, ruleset: "t" } },
      policy,
      autoApproveLimitEur: 10000,
      on: new Date("2026-10-16"),
    });
    expect(d.guaranteedAmount).toBe(6000); // 7,000 − 900 not covered − 100 excess, not cut to 5,200
    const steps = describeGuaranteeDecision(d.trace, d.flags);
    expect(steps.join(" ")).toMatch(/estimate is €7,000; €900 of it is never covered .*leaving €6,100/);
    expect(steps.join(" ")).toMatch(/about €5,200 on the reference tariff\. Before treatment that is advice only/);
  });

  it("converts between currencies through EUR", () => {
    expect(convert(38, "TRY", "EUR")).toBeCloseTo(1, 6);
    expect(convert(100, "EUR", "EUR")).toBe(100);
  });
});

describe("cost containment in the business case", () => {
  it("prices the reviewed share of medical spend", () => {
    expect(calculateCostContainment(DEFAULT_COST_CONTAINMENT)).toEqual({ reviewedSpend: 7_200_000, annualSaving: 576_000, monthlySaving: 48_000 });
    expect(calculateCostContainment({ annualMedicalSpend: -5, reviewedPct: 150, savingPct: 10 }).annualSaving).toBe(0);
  });

  it("adds its own section to the summary and keeps the closing line last", () => {
    const labour = buildSummary(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS, calculateBusinessCase(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS));
    const text = withCostContainment(labour, DEFAULT_COST_CONTAINMENT, calculateCostContainment(DEFAULT_COST_CONTAINMENT));
    expect(text).toContain("- Medical spend saved: €576,000 a year (€48,000 a month)");
    expect(text.split("\n").at(-1)).toBe(labour.split("\n").at(-1));
    expect(text.startsWith(labour.split("\n").slice(0, -1).join("\n"))).toBe(true);
  });
});
