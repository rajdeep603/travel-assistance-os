import { describe, expect, it } from "vitest";
import { decideGuarantee, type GuaranteeInputs } from "@/lib/services/guarantee-decision";
import { POLICY_PLANS } from "../../prisma/seed-data";
import type { Benefit } from "@/lib/services/policy";

const on = new Date("2026-10-15T09:00:00Z");
const policy = (plan: keyof typeof POLICY_PLANS, used = 0): NonNullable<GuaranteeInputs["policy"]> => ({
  number: "POL-TR-1",
  plan,
  validFrom: new Date("2026-08-01"),
  validTo: new Date("2027-08-01"),
  currency: "EUR",
  medicalLimit: POLICY_PLANS[plan].medicalLimit,
  medicalUsed: used,
  benefits: POLICY_PLANS[plan].benefits as Benefit[],
});
const estimate = (amount: number, currency = "EUR", diagnosis = "Suspected unstable angina") => ({
  amount,
  currency,
  diagnosis,
  treatment: ["Coronary angiography"],
  admissionDate: "2026-10-15",
});

describe("Letter of Guarantee decision", () => {
  it("guarantees the full estimate within policy and limits, automatically", () => {
    const d = decideGuarantee({ estimate: estimate(6850), policy: policy("Premier"), autoApproveLimitEur: 10000, on });
    expect(d.guaranteedAmount).toBe(6850);
    expect(d.excess).toBe(0);
    expect(d.flags).toEqual([]);
    expect(d.autoApprove).toBe(true);
    expect(d.trace).toHaveProperty("computation.rule");
  });

  it("deducts the plan excess", () => {
    const d = decideGuarantee({ estimate: estimate(2000), policy: policy("Plus"), autoApproveLimitEur: 10000, on });
    expect(d.excess).toBe(50);
    expect(d.guaranteedAmount).toBe(1950);
    expect(d.conditions.some((c) => c.includes("excess of 50 EUR"))).toBe(true);
  });

  it("caps at the remaining medical limit and asks a human", () => {
    const d = decideGuarantee({ estimate: estimate(9000), policy: policy("Essential", 46200), autoApproveLimitEur: 10000, on });
    expect(d.guaranteedAmount).toBe(3700); // 50,000 − 46,200 − 100 excess
    expect(d.flags).toContain("Estimate exceeds the remaining medical limit");
    expect(d.autoApprove).toBe(false);
  });

  it("converts foreign-currency estimates and answers in the hospital's currency", () => {
    const d = decideGuarantee({ estimate: estimate(190000, "TRY"), policy: policy("Premier"), autoApproveLimitEur: 10000, on });
    expect(d.guaranteedAmount).toBe(190000);
    expect((d.trace.computation as { estimateEur: number }).estimateEur).toBe(5000);
  });

  it("flags a possible pre-existing condition when the plan doesn't cover it", () => {
    const d = decideGuarantee({
      estimate: estimate(1500, "EUR", "Known chronic heart failure, decompensated"),
      policy: policy("Essential"),
      autoApproveLimitEur: 10000,
      on,
    });
    expect(d.flags).toContain("Possible pre-existing condition (not covered by the plan)");
  });

  it("refuses outside the policy period and above the automatic limit", () => {
    const expired = { ...policy("Premier"), validTo: new Date("2026-09-01") };
    expect(decideGuarantee({ estimate: estimate(500), policy: expired, autoApproveLimitEur: 10000, on }).flags).toContain(
      "Policy not valid on the treatment date"
    );
    const big = decideGuarantee({ estimate: estimate(25000), policy: policy("Premier"), autoApproveLimitEur: 10000, on });
    expect(big.flags[0]).toMatch(/automatic approval limit/);
    expect(big.guaranteedAmount).toBe(25000);
  });

  it("needs a human when there's no policy at all", () => {
    expect(decideGuarantee({ estimate: estimate(500), policy: null, autoApproveLimitEur: 10000, on }).autoApprove).toBe(false);
  });
});
