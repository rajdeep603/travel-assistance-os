import { describe, expect, it } from "vitest";
import { benchmarkEstimate } from "@/lib/cost-benchmarks";
import { decideGuarantee } from "@/lib/services/guarantee-decision";

// The usual-price check on a hospital's estimate, before it is guaranteed.

describe("cost estimate benchmark", () => {
  it("places the seeded estimates where the demo story needs them", () => {
    const check = (amount: number, currency: string, text: string, country: string) => benchmarkEstimate({ amount, currency, text, country })?.position;
    expect(check(1850, "EUR", "Chest tightness, acute coronary syndrome to be ruled out Cardiac monitoring (1 night)", "Turkiye")).toBe("within");
    expect(check(11950, "EUR", "Unstable angina pectoris Coronary angiography 2 nights coronary care unit", "Turkiye")).toBe("within");
    expect(check(24800, "TRY", "Acute gastroenteritis with dehydration", "Turkiye")).toBe("within");
    expect(check(4000, "USD", "Gastroenteritis with dehydration Intravenous rehydration", "Egypt")).toBe("within");
    expect(check(9500, "BRL", "Concussion and scalp laceration CT scan of the head", "Brazil")).toBe("within");
    expect(check(11400, "EUR", "Medial meniscus tear, right knee Arthroscopic meniscus repair", "Turkiye")).toBe("well-above");
  });

  it("says nothing when the treatment or the country isn't known", () => {
    expect(benchmarkEstimate({ amount: 900, currency: "EUR", text: "Consultation", country: "Turkiye" })).toBeNull();
    expect(benchmarkEstimate({ amount: 900, currency: "EUR", text: "Appendicitis", country: null })).toBeNull();
  });

  it("sends a guarantee far above the usual range to a person, with the reason", () => {
    // Under the automatic approval limit: only the price check stops it.
    const decision = decideGuarantee({
      country: "Turkiye",
      estimate: { amount: 11400, currency: "EUR", diagnosis: "Medial meniscus tear", treatment: ["Arthroscopic meniscus repair"], admissionDate: null },
      policy: { number: "POL-T", plan: "Premier", validFrom: new Date("2026-01-01"), validTo: new Date("2027-07-31"), currency: "EUR", medicalLimit: 1_000_000, medicalUsed: 0, benefits: [{ code: "HOSPITALIZATION", covered: true }] as never },
      autoApproveLimitEur: 20_000,
      on: new Date("2026-10-24"),
    });
    expect(decision.autoApprove).toBe(false);
    expect(decision.flags).toEqual(["Estimate 52% above the usual range for this treatment: agree the price with the hospital before guaranteeing"]);
    expect(decision.trace.benchmark).toMatchObject({ category: "knee-arthroscopy", position: "well-above", lowEur: 4000, highEur: 7500 });
  });
});
