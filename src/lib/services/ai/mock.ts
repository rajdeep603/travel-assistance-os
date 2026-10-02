import type { DocumentKind } from "@prisma/client";
import type {
  AIService,
  CaseIntakeAnalysis,
  ChatMessage,
  ClaimSummaryInput,
  ContextChunk,
  MedicalExtraction,
  MedicalExtractionResult,
  VoiceDialogState,
  VoiceNLUResult,
} from "../types";
import {
  findCity,
  findDistrict,
  findEmail,
  findExistingCaseRef,
  findLanguage,
  findName,
  findPhone,
  findSpecialty,
  matchSymptoms,
  maxUrgency,
  parseDateExpression,
  parseTimeExpression,
} from "../nlu";

// ---------------------------------------------------------------------------
// Deterministic demo AI provider. Implements the full AIService contract with
// rule-based logic so every workflow functions offline. Swappable for a live
// provider (see anthropic.ts) via the AI_API_KEY environment variable.
// ---------------------------------------------------------------------------

function grab(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:：]\\s*(.+)`,
      "i"
    );
    const m = text.match(re);
    if (m) {
      const value = m[1].trim().replace(/\s{2,}.*$/, "");
      if (value && !/^(n\/a|none|-|unknown)$/i.test(value)) return value;
    }
  }
  return null;
}

function grabList(text: string, labels: string[]): string[] {
  const raw = grab(text, labels);
  if (!raw) return [];
  return raw
    .split(/[;,]| and /i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Small jittered delay so the offline provider feels like a model thinking
 * rather than a canned lookup. Skipped under tests, and tunable via
 * MOCK_AI_LATENCY_MS (set to 0 to disable).
 */
async function thinkingDelay(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const base = Number(process.env.MOCK_AI_LATENCY_MS ?? 450);
  if (!Number.isFinite(base) || base <= 0) return;
  const ms = base + Math.random() * base;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockAIService implements AIService {
  readonly name = "demo-deterministic";

  async extractMedicalDocument(text: string): Promise<MedicalExtractionResult> {
    await thinkingDelay();
    const amountRaw = grab(text, [
      "Total Amount Due",
      "Invoice Total",
      "Total Amount",
      "Amount Due",
      "Grand Total",
    ]);
    let invoiceAmount: number | null = null;
    let currency: string | null = grab(text, ["Currency"]);
    if (amountRaw) {
      const m = amountRaw.replace(/,/g, "").match(/([A-Z]{3})?\s*([\d.]+)\s*([A-Z]{3})?/);
      if (m) {
        invoiceAmount = Number(m[2]);
        currency = currency ?? m[1] ?? m[3] ?? null;
      }
    }

    const extraction: MedicalExtraction = {
      patientName: grab(text, ["Patient Name", "Patient", "Name of Patient"]),
      dateOfBirth: grab(text, ["Date of Birth", "DOB", "Birth Date"]),
      hospital: grab(text, ["Hospital", "Facility", "Medical Center", "Clinic"]),
      doctor: grab(text, ["Attending Physician", "Doctor", "Physician", "Prescribing Doctor"]),
      diagnosis: grab(text, ["Diagnosis", "Primary Diagnosis", "Clinical Diagnosis"]),
      symptoms: grabList(text, ["Symptoms", "Presenting Symptoms", "Presenting Complaints"]),
      admissionDate: grab(text, ["Admission Date", "Date of Admission", "Admitted"]),
      dischargeDate: grab(text, ["Discharge Date", "Date of Discharge", "Discharged"]),
      procedures: grabList(text, ["Procedures", "Procedures Performed", "Treatment Provided"]),
      medications: grabList(text, ["Medications", "Medications Prescribed", "Prescription", "Prescribed"]),
      invoiceAmount,
      currency,
      policyReference: grab(text, [
        "Policy Number",
        "Policy Reference",
        "Policy No",
        "Claim Reference",
        "Claim Number",
      ]),
    };

    const missingInfo: string[] = [];
    if (!extraction.policyReference) missingInfo.push("Policy/claim reference missing");
    if (!extraction.dischargeDate) missingInfo.push("Discharge summary or discharge date unavailable");
    if (!extraction.patientName) missingInfo.push("Patient name not detected");
    if (!extraction.diagnosis) missingInfo.push("Diagnosis not detected");
    if (invoiceAmount == null) missingInfo.push("Invoice amount not found");
    if (!/signature|signed/i.test(text)) missingInfo.push("Doctor signature not detected");

    const fields = Object.values(extraction);
    const filled = fields.filter((v) =>
      Array.isArray(v) ? v.length > 0 : v !== null
    ).length;
    const confidence = Math.round((filled / fields.length) * 100) / 100;

    const parts: string[] = [];
    if (extraction.patientName) parts.push(`Patient ${extraction.patientName}`);
    if (extraction.diagnosis) parts.push(`was diagnosed with ${extraction.diagnosis.toLowerCase()}`);
    if (extraction.hospital) parts.push(`at ${extraction.hospital}`);
    if (extraction.admissionDate) parts.push(`(admitted ${extraction.admissionDate}${extraction.dischargeDate ? `, discharged ${extraction.dischargeDate}` : ""})`);
    if (extraction.procedures.length) parts.push(`. Procedures: ${extraction.procedures.join(", ")}`);
    if (extraction.medications.length) parts.push(`. Medications: ${extraction.medications.join(", ")}`);
    if (invoiceAmount != null) parts.push(`. Invoiced ${invoiceAmount.toLocaleString()} ${currency ?? ""}`.trimEnd());
    const summary =
      parts.length > 0
        ? `${parts.join(" ").replace(/\s+\./g, ".")}.`
        : "No structured medical information could be identified in this document.";

    return { extraction, summary, missingInfo, confidence };
  }

  async analyzeAssistanceRequest(text: string): Promise<CaseIntakeAnalysis> {
    await thinkingDelay();
    const symptoms = matchSymptoms(text);
    const urgency = maxUrgency(symptoms, text);
    const district = findDistrict(text);
    const city = findCity(text);
    const location = district && city ? `${district}, ${city}` : city ?? district;

    const t = text.toLowerCase();
    let patient: string | null = findName(text);
    if (!patient) {
      const rel = t.match(/my (husband|wife|son|daughter|mother|father|partner|friend|colleague)/);
      if (rel) patient = `Traveller's ${rel[1]}`;
      else if (/\b(i|me|my)\b/.test(t)) patient = "The traveller (caller)";
    }

    let assistanceType: CaseIntakeAnalysis["assistanceType"] = "MEDICAL";
    if (/evacuat/.test(t)) assistanceType = "EVACUATION";
    else if (/repatriat/.test(t)) assistanceType = "REPATRIATION";
    else if (/tooth|dental/.test(t)) assistanceType = "DENTAL";
    else if (/admission|admit|hospitalis|hospitaliz|surgery|operate/.test(t)) assistanceType = "HOSPITALIZATION";
    else if (symptoms.length === 0 && !/hospital|doctor|clinic|medical/.test(t)) assistanceType = "GENERAL";

    let requestedAction: string | null = null;
    if (/find(ing)? (a )?(hospital|clinic|doctor)|need (a )?(hospital|doctor)/.test(t)) requestedAction = "Find a suitable medical provider";
    else if (/appointment/.test(t)) requestedAction = "Arrange a medical appointment";
    else if (/ambulance|emergency/.test(t)) requestedAction = "Arrange emergency transport";
    else if (symptoms.length > 0) requestedAction = "Assess medical situation and arrange care";

    const suggestedActions: string[] = [];
    if (symptoms.length > 0 || assistanceType !== "GENERAL") {
      suggestedActions.push("Find medical provider");
      suggestedActions.push("Arrange appointment");
      suggestedActions.push("Contact provider to confirm availability");
    }
    if (urgency === "CRITICAL") suggestedActions.unshift("Advise caller to contact local emergency services (112)");
    if (urgency === "HIGH" || urgency === "CRITICAL") suggestedActions.push("Escalate to senior human case manager");
    else suggestedActions.push("Assign to human case manager for review");

    const issue = symptoms.length > 0 ? symptoms.map((s) => s.symptom).join(", ") : null;
    const summaryBits = [
      patient ?? "A traveller",
      issue ? `reports ${issue.toLowerCase()}` : "requests assistance",
      location ? `in ${location}` : "",
      `. Assistance type: ${assistanceType.toLowerCase()}, urgency ${urgency.toLowerCase()}.`,
      requestedAction ? ` Requested action: ${requestedAction.toLowerCase()}.` : "",
    ];

    return {
      patient,
      location,
      country: city || district ? "Turkiye" : null,
      medicalIssue: issue,
      symptoms: symptoms.map((s) => s.symptom),
      assistanceType,
      urgency,
      requestedAction,
      existingCaseRef: findExistingCaseRef(text),
      summary: summaryBits.filter(Boolean).join(" ").replace(/\s+/g, " ").replace(/\s\./g, "."),
      suggestedActions,
    };
  }

  async classifyDocument(text: string, filename = ""): Promise<DocumentKind> {
    await thinkingDelay();
    const t = `${filename}\n${text}`.toLowerCase();
    if (/invoice|amount due|billing|total amount/.test(t)) return "HOSPITAL_INVOICE";
    if (/discharge summary|discharge date|discharged/.test(t)) return "DISCHARGE_SUMMARY";
    if (/prescription|rx\b|prescribed|pharmacy/.test(t)) return "PRESCRIPTION";
    if (/medical report|diagnosis|clinical|examination|physician/.test(t)) return "MEDICAL_REPORT";
    return "OTHER";
  }

  async answerWithContext(question: string, context: ContextChunk[]): Promise<string> {
    await thinkingDelay();
    if (context.length === 0) {
      return "I could not find anything about that in the operational knowledge base. Try asking about case procedures, required documents, providers or claims processes.";
    }
    const best = context[0];
    const extra = context
      .slice(1, 3)
      .map((c) => `From “${c.title}”: ${firstSentences(c.content, 1)}`)
      .join("\n\n");
    return [firstSentences(best.content, 4), extra].filter(Boolean).join("\n\n");
  }

  async interpretVoiceUtterance(
    utterance: string,
    state: VoiceDialogState
  ): Promise<VoiceNLUResult> {
    const info: VoiceNLUResult["info"] = {};
    const t = utterance.toLowerCase();

    const name = findName(utterance);
    if (name) info.name = name;

    const district = findDistrict(utterance);
    const city = findCity(utterance);
    if (district) info.location = district;
    else if (city) info.location = city;

    const symptoms = matchSymptoms(utterance);
    if (symptoms.length > 0) {
      info.problem = symptoms[0].symptom;
      info.specialty = symptoms[0].specialty;
    }
    const explicitSpecialty = findSpecialty(utterance);
    if (explicitSpecialty && !info.specialty) info.specialty = explicitSpecialty;

    const date = parseDateExpression(utterance);
    if (date) info.preferredDate = date;
    const time = parseTimeExpression(utterance);
    if (time) info.preferredTime = time;

    const lang = findLanguage(utterance);
    if (lang) info.language = lang;

    const phone = findPhone(utterance);
    const email = findEmail(utterance);
    if (phone) info.contact = phone;
    else if (email) info.contact = email;

    // Bare answers to a direct question fill the expected slot.
    if (state.expecting && info[state.expecting] === undefined) {
      const bare = utterance.trim();
      if (state.expecting === "name" && !name && /^[A-Za-z'. -]{2,40}$/.test(bare) && !/\b(yes|no|ok|okay)\b/i.test(bare)) {
        info.name = bare
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      }
      if (state.expecting === "problem" && symptoms.length === 0 && bare.length > 2) {
        info.problem = bare;
        info.specialty = "General Medicine";
      }
      if (state.expecting === "contact" && !phone && !email && /\d{6,}/.test(bare.replace(/\D/g, ""))) {
        info.contact = bare;
      }
    }

    // Option selection ("the first one", "option 2", "number three").
    let selectedOption: number | null = null;
    const ord = t.match(/\b(first|second|third|1st|2nd|3rd|one|two|three)\b/);
    const num = t.match(/\b(?:option|number|no\.?)\s*(\d)\b/);
    if (state.step === "PRESENTING") {
      if (num) selectedOption = Number(num[1]);
      else if (ord) {
        const map: Record<string, number> = { first: 1, "1st": 1, one: 1, second: 2, "2nd": 2, two: 2, third: 3, "3rd": 3, three: 3 };
        selectedOption = map[ord[1]] ?? null;
      }
    }

    // Confirmation.
    let confirmation: "yes" | "no" | null = null;
    if (/\b(yes|yeah|yep|sure|confirm|correct|book it|please do|go ahead|sounds good|that works)\b/.test(t)) confirmation = "yes";
    else if (/\b(no|nope|cancel|don't|do not|change|different|wrong)\b/.test(t)) confirmation = "no";

    return { info, selectedOption, confirmation };
  }

  async summarizeClaim(input: ClaimSummaryInput): Promise<string> {
    await thinkingDelay();
    const docKinds = input.documents.map((d) => d.kind.replace(/_/g, " ").toLowerCase());
    const errors = input.issues.filter((i) => i.severity === "error");
    const lines = [
      `Claim ${input.claimRef} for ${input.patientName}.`,
      input.extraction.diagnosis ? `Diagnosis: ${input.extraction.diagnosis}.` : "",
      input.extraction.hospital ? `Treated at ${input.extraction.hospital}.` : "",
      input.extraction.invoiceAmount != null
        ? `Invoiced amount ${Number(input.extraction.invoiceAmount).toLocaleString()} ${input.extraction.currency ?? ""}.`.replace(/\s\./, ".")
        : "",
      docKinds.length ? `Documents on file: ${docKinds.join(", ")}.` : "No documents on file.",
      errors.length
        ? `Blocking issues: ${errors.map((e) => e.message.toLowerCase()).join("; ")}.`
        : "No blocking issues detected — ready for human review.",
    ];
    return lines.filter(Boolean).join(" ");
  }

  async summarizeConversation(messages: ChatMessage[]): Promise<string> {
    const userTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
    return `Voice-assisted intake completed over ${messages.length} turns. The traveller stated: ${userTexts
      .slice(0, 4)
      .map((t) => `“${t}”`)
      .join("; ")}${userTexts.length > 4 ? " …" : ""}`;
  }
}

function firstSentences(text: string, n: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [cleaned];
  return sentences.slice(0, n).join(" ").trim();
}
