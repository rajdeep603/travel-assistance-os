import { describe, expect, it } from "vitest";
import { describeGuaranteeDecision } from "@/lib/guarantee-trace";

const trace = {
  estimate: { amount: 260300, currency: "TRY" },
  autoApproveLimitEur: 10000,
  policy: { number: "POL-TR-100950", plan: "Premier", validFrom: "2026-09-01T00:00:00.000Z", validTo: "2026-12-31T00:00:00.000Z" },
  benefit: { covered: true, limit: null, excess: 0 },
  computation: { estimateEur: 6850, remainingMedicalLimitEur: 1000000, benefitLimitEur: null, excessEur: 0, guaranteedEur: 6850 },
};

describe("describeGuaranteeDecision", () => {
  it("explains an automatic approval step by step", () => {
    const steps = describeGuaranteeDecision(trace, []);
    expect(steps[0]).toMatch(/^Policy POL-TR-100950 \(Premier\), valid /);
    expect(steps[1]).toBe("Hospital admission is covered by this plan.");
    expect(steps[2]).toMatch(/estimate is €6,850.*TRY/);
    expect(steps[4]).toMatch(/= €6,850\.$/);
    expect(steps.at(-1)).toMatch(/within the automatic approval limit of €10,000, so it was approved automatically/);
    expect(steps.join(" ")).not.toMatch(/[{}"]/);
  });

  it("names the reasons a person must approve", () => {
    const steps = describeGuaranteeDecision(
      { ...trace, computation: { ...trace.computation, excessEur: 100, guaranteedEur: 14900 } },
      ["Above the automatic approval limit (EUR 10,000)"]
    );
    expect(steps.join(" ")).toMatch(/minus the €100 excess/);
    expect(steps.at(-1)).toBe("Needs a person's approval: above the automatic approval limit (EUR 10,000).");
  });

  it("copes with a missing policy or an empty trace", () => {
    expect(describeGuaranteeDecision({ policy: null }, ["No policy found for this patient"])[0]).toMatch(/No policy was found/);
    expect(describeGuaranteeDecision(null)).toEqual(["No policy was found for this patient, so nothing can be guaranteed automatically."]);
  });
});
