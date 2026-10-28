import type { DocumentKind } from "@prisma/client";
import type {
  AIService,
  BusinessCard,
  CaseIntakeAnalysis,
  ChatMessage,
  ClaimSummaryInput,
  ContextChunk,
  ConversationSummaryContext,
  DocumentFile,
  InvoiceLine,
  MedicalExtraction,
  MedicalExtractionResult,
} from "../types";
import { ApiError } from "@/lib/errors";
import { detectLanguage } from "@/lib/intake/language";
import { sampleScanText } from "@/lib/intake/samples";
import {
  countryOf,
  emergencyNumber,
  findCity,
  findDistrict,
  findExistingCaseRef,
  findName,
  matchSymptoms,
  maxUrgency,
} from "../nlu";
import { summarizeCall } from "./call-summary";

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

// Codes: the demo tariff's "520.030", or a US bill's CPT ("99285"), HCPCS ("J0696") or revenue ("0120") code.
const LINE_ROW = /^(\d{3}\.\d{3}|\d{5}|[A-Z]\d{4}|\d{4})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/;
const num = (s: string) => Number(s.replace(/,/g, ""));

/** Charge rows of an itemised invoice or estimate: "520.030 Description 1 6,500.00 6,500.00". */
export function parseLineItems(text: string): InvoiceLine[] {
  const lines: InvoiceLine[] = [];
  for (const raw of text.split("\n")) {
    const m = raw.trim().match(LINE_ROW);
    if (m) lines.push({ code: m[1], description: m[2], quantity: num(m[3]), unitPrice: num(m[4]), amount: num(m[5]) });
  }
  return lines;
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
      "Estimated Total",
      "Estimated Cost",
      "Tahmini Toplam",
      "Toplam Tutar",
      // French, Spanish and Portuguese invoices (North Africa, Latin America).
      "Montant total",
      "Total à payer",
      "Total a pagar",
      "Importe total",
      "Valor total",
    ]);
    let invoiceAmount: number | null = null;
    let currency: string | null = grab(text, ["Currency", "Para Birimi", "Devise", "Moneda", "Moeda"]);
    if (amountRaw) {
      const m = amountRaw.replace(/,/g, "").match(/([A-Z]{3})?\s*([\d.]+)\s*([A-Z]{3})?/);
      if (m) {
        invoiceAmount = Number(m[2]);
        currency = currency ?? m[1] ?? m[3] ?? null;
      }
    }

    const extraction: MedicalExtraction = {
      // English labels, plus the Turkish ones used by local hospitals and the
      // French, Spanish and Portuguese ones of North African and Latin American clinics.
      patientName: grab(text, ["Patient Name", "Patient", "Name of Patient", "Hasta Adı", "Hasta", "Nom du patient", "Nom du malade", "Paciente", "Nombre del paciente", "Nome do paciente"]),
      dateOfBirth: grab(text, ["Date of Birth", "DOB", "Birth Date", "Doğum Tarihi", "Date de naissance", "Fecha de nacimiento", "Data de nascimento"]),
      hospital: grab(text, ["Hospital", "Facility", "Medical Center", "Clinic", "Hastane", "Kurum", "Établissement", "Clinique", "Clínica", "Centro médico"]),
      doctor: grab(text, ["Attending Physician", "Doctor", "Physician", "Prescribing Doctor", "Sorumlu Hekim", "Doktor", "Médecin traitant", "Médico tratante", "Médico responsável"]),
      diagnosis: grab(text, ["Diagnosis", "Primary Diagnosis", "Clinical Diagnosis", "Tanı", "Teşhis", "Diagnostic", "Diagnóstico"]),
      symptoms: grabList(text, ["Symptoms", "Presenting Symptoms", "Presenting Complaints", "Şikayetler", "Symptômes", "Síntomas", "Sintomas"]),
      admissionDate: grab(text, ["Admission Date", "Date of Admission", "Admitted", "Planned Admission", "Yatış Tarihi", "Date d'admission", "Fecha de ingreso", "Data de internação"]),
      dischargeDate: grab(text, ["Discharge Date", "Date of Discharge", "Discharged", "Taburcu Tarihi", "Date de sortie", "Fecha de alta", "Data de alta"]),
      procedures: grabList(text, ["Procedures", "Procedures Performed", "Treatment Provided", "Planned Treatment", "Yapılan İşlemler", "Planlanan Tedavi", "Actes réalisés", "Procedimientos", "Procedimentos"]),
      medications: grabList(text, ["Medications", "Medications Prescribed", "Prescription", "Prescribed", "İlaçlar", "Traitement de sortie", "Medicamentos"]),
      invoiceAmount,
      currency,
      policyReference: grab(text, [
        "Policy Number",
        "Policy Reference",
        "Policy No",
        "Claim Reference",
        "Claim Number",
        "Poliçe No",
        "Poliçe Numarası",
        "Numéro de police",
        "Número de póliza",
        "Número da apólice",
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

    const documentNumber = grab(text, ["Invoice No", "Invoice Number", "Estimate No", "Fatura No", "Proforma No", "Facture N°", "Factura N.º", "Account No"]);
    return { extraction, documentNumber, lineItems: parseLineItems(text), summary, missingInfo, confidence, source: "offline" };
  }

  async analyzeAssistanceRequest(text: string): Promise<CaseIntakeAnalysis> {
    await thinkingDelay();
    const symptoms = matchSymptoms(text);
    const urgency = maxUrgency(symptoms, text);
    const district = findDistrict(text);
    const city = findCity(text);
    const location = district && city ? `${district}, ${city}` : city ?? district;
    const country = city ? countryOf(city) : district ? "Turkiye" : null;

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
    if (urgency === "CRITICAL") suggestedActions.unshift(`Advise caller to contact local emergency services (${emergencyNumber(country)})`);
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
      country,
      medicalIssue: issue,
      symptoms: symptoms.map((s) => s.symptom),
      assistanceType,
      urgency,
      requestedAction,
      existingCaseRef: findExistingCaseRef(text),
      summary: summaryBits.filter(Boolean).join(" ").replace(/\s+/g, " ").replace(/\s\./g, "."),
      suggestedActions,
      source: "offline",
    };
  }

  async classifyDocument(text: string, filename = ""): Promise<DocumentKind> {
    await thinkingDelay();
    const t = `${filename}\n${text}`.toLowerCase();
    // English and Turkish, plus French, Spanish and Portuguese wording.
    if (/cost estimate|estimated total|estimated cost|maliyet tahmini|tahmini toplam|\bdevis\b|presupuesto|orçamento/.test(t)) return "COST_ESTIMATE";
    if (/invoice|amount due|billing|total amount|fatura|facture|factura|montant total|total a pagar|valor total/.test(t)) return "HOSPITAL_INVOICE";
    if (/discharge summary|discharge date|discharged|epikriz|taburcu|compte rendu d'hospitalisation|date de sortie|informe de alta|fecha de alta|data de alta/.test(t)) return "DISCHARGE_SUMMARY";
    if (/prescription|rx\b|prescribed|pharmacy|reçete|ordonnance|receta/.test(t)) return "PRESCRIPTION";
    if (/medical report|diagnosis|clinical|examination|physician|tıbbi rapor|tanı|informe médico|diagnóstico|diagnostic|relatório médico/.test(t)) return "MEDICAL_REPORT";
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

  /** Outcome first, transcript second; see ./call-summary. */
  async summarizeConversation(messages: ChatMessage[], context?: ConversationSummaryContext): Promise<string> {
    return summarizeCall(messages, context);
  }

  /**
   * Offline OCR knows only the bundled fax samples (their written text is the
   * ground truth); any other scan needs the live model.
   */
  async readDocument(file: DocumentFile): Promise<{ text: string; language: string | null }> {
    await thinkingDelay();
    const text = sampleScanText(file.filename, file.buffer);
    if (!text) {
      throw new ApiError(
        "This is a scanned document. Reading scans (OCR) needs the live AI model (AI_API_KEY).",
        422,
        "OCR_UNAVAILABLE"
      );
    }
    return { text, language: detectLanguage(text) };
  }

  /**
   * Offline translation: medical glossaries for Turkish (the demo's hospital
   * language) and the French, Spanish and Portuguese of the regional samples,
   * clearly labelled; anything else needs the live model.
   */
  async translateText(text: string, targetLanguage: string): Promise<string> {
    await thinkingDelay();
    const glossary = targetLanguage === "English" ? GLOSSARIES[detectLanguage(text)] : undefined;
    if (!glossary) {
      return `[Translation needs the live AI model — original text follows]\n${text}`;
    }
    let out = text;
    for (const [from, en] of glossary) out = out.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), en);
    return `[Offline glossary translation — verify before relying on it]\n${out}`;
  }

  /** Offline rules can't read a photo: an empty card, for the presenter to type in. */
  async readBusinessCard(): Promise<BusinessCard> {
    return { name: null, company: null, jobTitle: null, email: null, phone: null, website: null };
  }
}

function firstSentences(text: string, n: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [cleaned];
  return sentences.slice(0, n).join(" ").trim();
}

// Longest phrases first so they win over their parts.
const TR_EN_GLOSSARY: [string, string][] = [
  ["KURGUSAL DEMO BELGESİ — YALNIZCA GÖSTERİM AMAÇLIDIR", "FICTIONAL DEMO DOCUMENT — FOR DEMONSTRATION ONLY"],
  ["Hasta stabil durumda taburcu edilmiştir", "The patient was discharged in a stable condition"],
  ["Uçuş öncesi kardiyoloji kontrolü önerilir", "A cardiology check-up before flying is recommended"],
  ["Kararsız angina pektoris", "Unstable angina pectoris"],
  ["Koroner anjiyografi", "Coronary angiography"],
  ["EKG takibi", "ECG monitoring"],
  ["göğüs ağrısı", "chest pain"],
  ["nefes darlığı", "shortness of breath"],
  ["Taburcu Özeti", "Discharge Summary"],
  ["Sorumlu Hekim", "Attending Physician"],
  ["Hasta Adı", "Patient Name"],
  ["Doğum Tarihi", "Date of Birth"],
  ["Poliçe No", "Policy Number"],
  ["Yatış Tarihi", "Admission Date"],
  ["Taburcu Tarihi", "Discharge Date"],
  ["Yapılan İşlemler", "Procedures"],
  ["Şikayetler", "Symptoms"],
  ["İlaçlar", "Medications"],
  ["Hastane", "Hospital"],
  ["Tanı", "Diagnosis"],
  ["İmza", "Signed"],
  ["EPİKRİZ", "DISCHARGE SUMMARY (EPICRISIS)"],
  ["Epikriz", "Discharge summary"],
  ["Sayın yetkili", "Dear Sir or Madam"],
  ["Saygılarımızla", "Kind regards"],
  ["Uluslararası Hasta Birimi", "International Patient Department"],
  ["Hastanız", "Your patient"],
  ["belgesini ekte bulabilirsiniz", "document is attached"],
  ["stabil olarak taburcu edilmiştir", "was discharged in a stable condition"],
  ["Ekim", "October"],
  ["Maliyet Tahmini", "Cost Estimate"],
];

// The regional samples' French (North Africa), Spanish (the Caribbean) and
// Portuguese (Brazil). Longest phrases first so they win over their parts.
const FR_EN_GLOSSARY: [string, string][] = [
  ["Document fictif préparé pour la démonstration", "Fictional document prepared for the demonstration"],
  ["Ce n'est pas un vrai dossier", "Not a real record"],
  ["Compte rendu d'hospitalisation", "Hospital discharge report"],
  ["COMPTE RENDU", "DISCHARGE REPORT"],
  ["Patient admis par les urgences pour fièvre et douleur lombaire droite", "Patient admitted through the emergency department with fever and right flank pain"],
  ["L'échographie rénale ne montre pas d'obstacle", "The renal ultrasound shows no obstruction"],
  ["Évolution favorable sous antibiothérapie intraveineuse", "Good progress on intravenous antibiotics"],
  ["apyrexie à 48 heures", "fever-free at 48 hours"],
  ["Sortie en bon état général", "Discharged in good general condition"],
  ["Apte au voyage en vol commercial à partir du", "Fit to travel on a commercial flight from"],
  ["Contrôle par le médecin traitant au retour en France", "Follow-up with the family doctor on return to France"],
  ["Pyélonéphrite aiguë droite", "Acute right pyelonephritis"],
  ["fièvre à 39,5 °C", "fever of 39.5 °C"],
  ["douleur lombaire droite", "right flank pain"],
  ["brûlures mictionnelles", "burning on urination"],
  ["Échographie rénale", "Renal ultrasound"],
  ["hémocultures", "blood cultures"],
  ["antibiothérapie intraveineuse", "intravenous antibiotics"],
  ["deux fois par jour pendant 10 jours", "twice a day for 10 days"],
  ["Signature et cachet", "Signature and stamp"],
  ["Synthèse médicale", "Medical summary"],
  ["Traitement de sortie", "Discharge medication"],
  ["Actes réalisés", "Procedures"],
  ["Nom du patient", "Patient Name"],
  ["Date de naissance", "Date of Birth"],
  ["Numéro de police", "Policy Number"],
  ["Établissement", "Hospital"],
  ["Médecin traitant", "Attending Physician"],
  ["Date d'admission", "Admission Date"],
  ["Date de sortie", "Discharge Date"],
  ["Médecine interne", "Internal medicine"],
  ["Diagnostic", "Diagnosis"],
  ["Symptômes", "Symptoms"],
  ["Évolution", "Course"],
  ["Nationalité", "Nationality"],
  ["Masculin", "Male"],
  ["Séjour", "Stay"],
  ["Chambre", "Room"],
  ["Service", "Department"],
  ["Sexe", "Sex"],
  ["Hôtel", "Hotel"],
  ["Veuillez trouver ci-joint", "Please find attached"],
  ["Merci de nous confirmer la prise en charge", "Please confirm the guarantee of payment"],
  ["Bien cordialement", "Kind regards"],
  ["Bonjour", "Hello"],
];

const ES_EN_GLOSSARY: [string, string][] = [
  ["Documento ficticio preparado para la demostración de", "Fictional document prepared for the demonstration of"],
  ["No es un registro real", "Not a real record"],
  ["La paciente sufrió una caída en la piscina del hotel", "The patient fell at the hotel pool"],
  ["La radiografía confirma una fractura no desplazada del radio distal izquierdo", "The X-ray confirms an undisplaced fracture of the distal left radius"],
  ["Se coloca férula de yeso por debajo del codo", "A below-elbow plaster cast was applied"],
  ["Control en consulta de traumatología en 7 días", "Orthopaedic follow-up in 7 days"],
  ["Puede viajar en vuelo comercial con la férula", "She may travel on a commercial flight with the cast"],
  ["se recomienda asistencia en el aeropuerto", "airport assistance is recommended"],
  ["Fractura de radio distal izquierdo, no desplazada", "Fracture of the distal left radius, undisplaced"],
  ["dolor intenso", "severe pain"],
  ["inflamación", "swelling"],
  ["deformidad leve de la muñeca izquierda", "mild deformity of the left wrist"],
  ["Radiografía de muñeca", "Wrist X-ray"],
  ["inmovilización con férula de yeso", "immobilisation in a plaster cast"],
  ["cada 8 horas", "every 8 hours"],
  ["si hay dolor", "if in pain"],
  ["Evaluación clínica", "Clinical assessment"],
  ["Firma y sello", "Signature and stamp"],
  ["INFORME MÉDICO", "MEDICAL REPORT"],
  ["Urgencias", "Emergency department"],
  ["Traumatología", "Orthopaedics"],
  ["Paciente", "Patient"],
  ["Fecha de nacimiento", "Date of Birth"],
  ["Número de póliza", "Policy Number"],
  ["Médico tratante", "Attending Physician"],
  ["Fecha de ingreso", "Admission Date"],
  ["Clínica", "Clinic"],
  ["Diagnóstico", "Diagnosis"],
  ["Síntomas", "Symptoms"],
  ["Procedimientos", "Procedures"],
  ["Medicamentos", "Medications"],
  ["Nacionalidad", "Nationality"],
  ["Reino Unido", "United Kingdom"],
  ["Femenino", "Female"],
  ["Atención", "Care"],
  ["Servicio", "Department"],
  ["Llegada", "Arrived by"],
  ["Taxi del hotel", "Hotel taxi"],
  ["Hora", "Time"],
  ["Fecha", "Date"],
  ["Sexo", "Sex"],
  ["Plan", "Plan"],
  ["Adjuntamos el informe médico y la factura de su asegurada", "We attach the medical report and the invoice for your insured"],
  ["Les rogamos el pago por transferencia en dólares", "Please pay by bank transfer in US dollars"],
  ["Estimados señores", "Dear sirs"],
  ["Saludos cordiales", "Kind regards"],
];

const PT_EN_GLOSSARY: [string, string][] = [
  ["Poderiam confirmar a garantia de pagamento da sua segurada", "Could you confirm the guarantee of payment for your insured"],
  ["Nosso faturamento não encontra a carta", "Our billing department cannot find the letter"],
  ["Garantia de pagamento", "Guarantee of payment"],
  ["Atendimento Internacional", "International Patient Services"],
  ["nascida em", "born"],
  ["Atenciosamente", "Kind regards"],
  ["Prezados", "Dear colleagues"],
];

const GLOSSARIES: Record<string, [string, string][]> = {
  tr: TR_EN_GLOSSARY,
  fr: FR_EN_GLOSSARY,
  es: ES_EN_GLOSSARY,
  pt: PT_EN_GLOSSARY,
};
