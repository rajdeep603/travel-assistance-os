import { describe, expect, it } from "vitest";
import { reviewBill, type BillLine, type BillReviewInput } from "@/lib/services/bill-review";
import { parseLineItems } from "@/lib/services/ai/mock";
import { PRICE_TOLERANCE, stayNorm, tariffFor } from "@/lib/services/tariff";

const line = (code: string | null, description: string, quantity: number, unitPrice: number, amount = quantity * unitPrice): BillLine => ({
  code,
  description,
  quantity,
  unitPrice,
  amount,
});

const invoice = (lines: BillLine[], patch: Partial<BillReviewInput> = {}): BillReviewInput => ({
  kind: "HOSPITAL_INVOICE",
  lines,
  total: lines.reduce((s, l) => s + (l.amount ?? 0), 0),
  currency: "EUR",
  diagnosis: null,
  admissionDate: null,
  dischargeDate: null,
  ...patch,
});

describe("bill review rules", () => {
  it("accepts prices up to the tolerance and caps those above it", () => {
    const ok = reviewBill(invoice([line("803.500", "Coronary angiography, diagnostic", 1, 2000 * PRICE_TOLERANCE)]));
    expect(ok.savings).toBe(0);
    const high = reviewBill(invoice([line("803.500", "Coronary angiography, diagnostic", 1, 3400)]));
    expect(high.recommended).toBe(2500);
    expect(high.findings[0]).toMatchObject({ rule: "PRICE_ABOVE_REFERENCE", line: 0, saving: 900 });
    expect(high.findings[0].reason).toMatch(/Billed 3,400\.00 EUR each; the reference is 2,000\.00 EUR, and up to 2,500\.00 EUR is accepted\./);
  });

  it("converts the reference into the invoice's currency", () => {
    // 180 EUR at the demo rate of 38 TRY: 6,840 TRY; cap 8,550 TRY.
    const tryBill = reviewBill(invoice([line("520.030", "Emergency department admission", 1, 9000)], { currency: "TRY" }));
    expect(tryBill.recommended).toBe(8550);
    expect(tryBill.savingsEur).toBeCloseTo(450 / 38, 2);
  });

  it("does not cover comfort items or duplicates", () => {
    const r = reviewBill(
      invoice([
        line("803.410", "Coronary CT angiography", 1, 1450),
        line("803.410", "Coronary CT angiography", 1, 1450),
        line(null, "Telephone and television", 1, 85),
        line("950.930", "VIP lounge waiting fee", 1, 60),
      ])
    );
    expect(r.findings.map((f) => f.rule)).toEqual(["DUPLICATE", "NON_MEDICAL", "NON_MEDICAL"]);
    expect(r.notCovered).toBe(1450 + 85 + 60);
    expect(r.recommended).toBe(1450);
    expect(r.lines.map((l) => l.covered)).toEqual([true, false, false, false]);
  });

  it("allows only the nights of the stay, or the usual stay without dates", () => {
    const byDates = reviewBill(
      invoice([line("510.140", "Cardiology ward (per night)", 3, 720)], { admissionDate: "2026-10-12", dischargeDate: "2026-10-14" })
    );
    expect(byDates.stay).toEqual({ nights: 2, basis: "dates" });
    expect(byDates.findings[0]).toMatchObject({ rule: "EXTRA_NIGHTS", saving: 720 });
    const byNorm = reviewBill(invoice([line("510.120", "Ward accommodation (per night)", 3, 380)], { diagnosis: "Acute gastroenteritis" }));
    expect(byNorm.stay).toEqual({ nights: 2, basis: "norm" });
    expect(byNorm.savings).toBe(380);
    const noNorm = reviewBill(invoice([line("510.120", "Ward accommodation (per night)", 9, 380)], { diagnosis: "Something rare" }));
    expect(noNorm.savings).toBe(0);
  });

  it("flags arithmetic and totals without cutting on them alone", () => {
    const r = reviewBill(invoice([line("520.010", "Emergency consultation", 2, 100, 250)], { total: 300 }));
    expect(r.findings.map((f) => f.rule)).toEqual(["ARITHMETIC", "TOTAL_MISMATCH"]);
    // The line is paid at quantity × price (200), not the 250 printed.
    expect(r.recommended).toBe(200);
  });

  it("asks a person to check items with no reference price", () => {
    const r = reviewBill(invoice([line("777.777", "Hyperbaric oxygen session", 1, 900)]));
    expect(r.findings).toEqual([{ line: 0, rule: "NO_REFERENCE", reason: "No reference price for this item: check it by hand.", saving: 0 }]);
    expect(r.savings).toBe(0);
  });
});

describe("tariff lookups", () => {
  it("finds an item by code, then by description", () => {
    expect(tariffFor("803.500", "anything")?.label).toBe("Coronary angiography, diagnostic");
    expect(tariffFor(null, "MRI scan, knee")?.code).toBe("802.310");
    expect(tariffFor("999.999", "Physiotherapy session")?.code).toBe("930.010");
    expect(tariffFor(null, "Something else")).toBeNull();
  });

  it("knows the usual stay for common diagnoses", () => {
    expect(stayNorm("Suspected unstable angina")).toBe(4);
    expect(stayNorm(null)).toBeNull();
  });
});

describe("offline line parsing", () => {
  it("reads charge rows and skips totals", () => {
    const text = [
      "Code Description Qty Unit price Amount",
      "520.030 Emergency department admission 1 6,500.00 6,500.00",
      "510.120 Ward accommodation (per night) 2 4,500.00 9,000.00",
      "Subtotal: 15,500.00",
      "Grand Total: 15,500.00 TRY",
    ].join("\n");
    expect(parseLineItems(text)).toEqual([
      { code: "520.030", description: "Emergency department admission", quantity: 1, unitPrice: 6500, amount: 6500 },
      { code: "510.120", description: "Ward accommodation (per night)", quantity: 2, unitPrice: 4500, amount: 9000 },
    ]);
  });
});
