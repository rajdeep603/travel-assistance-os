import { describe, expect, it } from "vitest";
import { MockAIService } from "@/lib/services/ai/mock";
import type { VoiceDialogState } from "@/lib/services/types";

const ai = new MockAIService();

const SAMPLE_REPORT = `
MEDICAL REPORT
Hospital: Istanbul Central Demo Hospital
Attending Physician: Dr. Kerem Aydin
Patient Name: Aylin Yilmaz
Date of Birth: 1987-03-14
Admission Date: 2026-09-18
Discharge Date: 2026-09-20
Presenting Symptoms: severe abdominal pain, nausea, dehydration
Diagnosis: Acute gastroenteritis
Procedures: Intravenous rehydration, blood panel
Medications: Ondansetron 4mg, Oral rehydration salts
Total Amount Due: 25,250.00 TRY
Currency: TRY
Policy Number: POL-TR-100944
Signature: Dr. Kerem Aydin (signed)
`;

describe("MockAIService: document extraction", () => {
  it("extracts every labelled field", async () => {
    const result = await ai.extractMedicalDocument(SAMPLE_REPORT);
    const e = result.extraction;
    expect(e.patientName).toBe("Aylin Yilmaz");
    expect(e.dateOfBirth).toBe("1987-03-14");
    expect(e.hospital).toBe("Istanbul Central Demo Hospital");
    expect(e.doctor).toBe("Dr. Kerem Aydin");
    expect(e.diagnosis).toBe("Acute gastroenteritis");
    expect(e.symptoms).toEqual(["severe abdominal pain", "nausea", "dehydration"]);
    expect(e.admissionDate).toBe("2026-09-18");
    expect(e.dischargeDate).toBe("2026-09-20");
    expect(e.medications).toHaveLength(2);
    expect(e.invoiceAmount).toBe(25250);
    expect(e.currency).toBe("TRY");
    expect(e.policyReference).toBe("POL-TR-100944");
    expect(result.missingInfo).toHaveLength(0);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.summary).toContain("Aylin Yilmaz");
  });

  it("reports missing information for sparse documents", async () => {
    const result = await ai.extractMedicalDocument(
      "Patient Name: John Doe\nDiagnosis: Sprained ankle"
    );
    expect(result.missingInfo).toContain("Policy/claim reference missing");
    expect(result.missingInfo).toContain("Invoice amount not found");
    expect(result.missingInfo.join(" ")).toContain("signature");
  });
});

describe("MockAIService: assistance request analysis", () => {
  it("analyses the ITIC sample request correctly", async () => {
    const a = await ai.analyzeAssistanceRequest(
      "My husband is travelling in Istanbul and has developed severe stomach pain. We are staying near Taksim. We need help finding a hospital."
    );
    expect(a.patient).toBe("Traveller's husband");
    expect(a.location).toBe("Taksim, Istanbul");
    expect(a.medicalIssue).toContain("Abdominal pain");
    expect(a.assistanceType).toBe("MEDICAL");
    expect(a.urgency).toBe("HIGH");
    expect(a.requestedAction).toMatch(/provider/i);
    expect(a.suggestedActions.length).toBeGreaterThan(2);
  });

  it("detects existing case references", async () => {
    const a = await ai.analyzeAssistanceRequest(
      "Following up about CASE-1024, is there any update on the admission?"
    );
    expect(a.existingCaseRef).toBe("CASE-1024");
  });

  it("classifies dental and repatriation requests", async () => {
    const dental = await ai.analyzeAssistanceRequest(
      "I broke a tooth in Kadikoy and need a dentist"
    );
    expect(dental.assistanceType).toBe("DENTAL");
    const rep = await ai.analyzeAssistanceRequest(
      "We need to arrange repatriation home for my mother after her surgery"
    );
    expect(rep.assistanceType).toBe("REPATRIATION");
  });
});

describe("MockAIService: document classification", () => {
  it("classifies by content", async () => {
    expect(await ai.classifyDocument("Total Amount Due: 500 EUR invoice")).toBe("HOSPITAL_INVOICE");
    expect(await ai.classifyDocument("DISCHARGE SUMMARY for patient")).toBe("DISCHARGE_SUMMARY");
    expect(await ai.classifyDocument("Prescription Rx-1 prescribed by")).toBe("PRESCRIPTION");
    expect(await ai.classifyDocument("Clinical examination and diagnosis")).toBe("MEDICAL_REPORT");
    expect(await ai.classifyDocument("holiday photos")).toBe("OTHER");
  });
});

describe("MockAIService: voice NLU", () => {
  const baseState = (): VoiceDialogState => ({
    step: "COLLECTING",
    expecting: null,
    info: {
      name: null, location: null, problem: null, specialty: null,
      preferredDate: null, preferredTime: null, language: null, contact: null,
    },
    presentedProviderIds: [],
    selectedProviderId: null,
    selectedSlot: null,
    appointmentRef: null,
    caseRef: null,
  });

  it("extracts multiple slots from one utterance", async () => {
    const r = await ai.interpretVoiceUtterance(
      "I'm in Taksim with a bad fever and need a doctor tomorrow afternoon",
      baseState()
    );
    expect(r.info.location).toBe("Taksim");
    expect(r.info.specialty).toBe("General Medicine");
    expect(r.info.preferredDate).toBeTruthy();
    expect(r.info.preferredTime).toBe("afternoon");
  });

  it("fills the expected slot from a bare answer", async () => {
    const state = baseState();
    state.expecting = "name";
    const r = await ai.interpretVoiceUtterance("Daniel Foster", state);
    expect(r.info.name).toBe("Daniel Foster");
  });

  it("detects option selection while presenting", async () => {
    const state = baseState();
    state.step = "PRESENTING";
    expect((await ai.interpretVoiceUtterance("the first one please", state)).selectedOption).toBe(1);
    expect((await ai.interpretVoiceUtterance("option 2", state)).selectedOption).toBe(2);
  });

  it("detects confirmation and refusal", async () => {
    const state = baseState();
    expect((await ai.interpretVoiceUtterance("yes, book it", state)).confirmation).toBe("yes");
    expect((await ai.interpretVoiceUtterance("no, cancel that", state)).confirmation).toBe("no");
  });
});
