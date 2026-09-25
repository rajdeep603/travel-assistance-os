import { describe, expect, it } from "vitest";
import { checkCompleteness } from "@/lib/services/claims";

type AnyClaim = Parameters<typeof checkCompleteness>[0];

function claimWith(kinds: string[], policyRef: string | null): AnyClaim {
  return {
    id: "c1",
    ref: "CLM-TEST",
    status: "PROCESSING",
    amount: null,
    currency: null,
    summary: null,
    issues: null,
    history: null,
    patientId: "p1",
    caseId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: { id: "p1", firstName: "Test", lastName: "Patient" },
    documents: kinds.map((kind, i) => ({
      id: `d${i}`,
      filename: `${kind.toLowerCase()}.pdf`,
      kind,
      status: "PROCESSED",
      extraction:
        i === 0
          ? { policyReference: policyRef, invoiceAmount: 100 }
          : { policyReference: null, invoiceAmount: null },
    })),
  } as unknown as AnyClaim;
}

describe("Claims completeness check", () => {
  it("passes a complete claim", () => {
    const issues = checkCompleteness(
      claimWith(["MEDICAL_REPORT", "HOSPITAL_INVOICE", "DISCHARGE_SUMMARY"], "POL-1")
    );
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(issues.find((i) => i.message.includes("Policy number found"))).toBeTruthy();
  });

  it("flags missing documents and policy number", () => {
    const issues = checkCompleteness(claimWith(["HOSPITAL_INVOICE"], null));
    const errors = issues.filter((i) => i.severity === "error").map((i) => i.message);
    expect(errors).toContain("Medical report missing");
    expect(errors).toContain("Discharge summary missing");
    expect(errors).toContain("Policy number missing");
    expect(issues.find((i) => i.message === "Hospital invoice available")?.severity).toBe("ok");
  });

  it("treats prescription as optional (warning only)", () => {
    const issues = checkCompleteness(
      claimWith(["MEDICAL_REPORT", "HOSPITAL_INVOICE", "DISCHARGE_SUMMARY"], "POL-1")
    );
    const prescription = issues.find((i) => i.message.includes("Prescription"));
    expect(prescription?.severity).toBe("warning");
  });

  it("flags failed document processing", () => {
    const claim = claimWith(["MEDICAL_REPORT"], "POL-1");
    (claim.documents[0] as { status: string }).status = "FAILED";
    const issues = checkCompleteness(claim);
    expect(issues.some((i) => i.severity === "error" && i.message.includes("failed processing"))).toBe(true);
  });
});
