import type { DocumentKind } from "@prisma/client";

// ---------------------------------------------------------------------------
// Shared service contracts. External AI providers are isolated behind
// AIService so the platform never couples to a single vendor. A deterministic
// demo implementation (MockAIService) keeps every workflow functional offline.
// ---------------------------------------------------------------------------

export interface MedicalExtraction {
  patientName: string | null;
  dateOfBirth: string | null;
  hospital: string | null;
  doctor: string | null;
  diagnosis: string | null;
  symptoms: string[];
  admissionDate: string | null;
  dischargeDate: string | null;
  procedures: string[];
  medications: string[];
  invoiceAmount: number | null;
  currency: string | null;
  policyReference: string | null;
}

export interface MedicalExtractionResult {
  extraction: MedicalExtraction;
  summary: string;
  missingInfo: string[];
  confidence: number;
}

export interface CaseIntakeAnalysis {
  patient: string | null;
  location: string | null;
  country: string | null;
  medicalIssue: string | null;
  symptoms: string[];
  assistanceType:
    | "MEDICAL"
    | "DENTAL"
    | "HOSPITALIZATION"
    | "EVACUATION"
    | "REPATRIATION"
    | "GENERAL";
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  requestedAction: string | null;
  existingCaseRef: string | null;
  summary: string;
  suggestedActions: string[];
}

export interface ContextChunk {
  title: string;
  source: string;
  content: string;
  score: number;
}

export interface AssistantAnswer {
  answer: string;
  sources: { title: string; source: string }[];
}

// --- Voice agent -----------------------------------------------------------

export type VoiceStep =
  | "GREETING"
  | "COLLECTING"
  | "SEARCHING"
  | "PRESENTING"
  | "CONFIRMING"
  | "BOOKED"
  | "HANDOFF";

export interface VoicePatientInfo {
  name: string | null;
  location: string | null;
  problem: string | null;
  specialty: string | null;
  preferredDate: string | null; // YYYY-MM-DD
  preferredTime: string | null; // e.g. "afternoon" or "14:00"
  language: string | null;
  contact: string | null;
}

export interface VoiceDialogState {
  step: VoiceStep;
  /** The slot the agent's last question asked for (helps interpret bare answers). */
  expecting: keyof VoicePatientInfo | null;
  info: VoicePatientInfo;
  presentedProviderIds: string[];
  selectedProviderId: string | null;
  selectedSlot: { date: string; time: string } | null;
  appointmentRef: string | null;
  caseRef: string | null;
}

export interface VoiceNLUResult {
  /** Fields newly extracted from this utterance (only the ones found). */
  info: Partial<VoicePatientInfo>;
  /** 1-based option selection when the user picks a presented provider. */
  selectedOption: number | null;
  confirmation: "yes" | "no" | null;
}

export interface ClaimSummaryInput {
  claimRef: string;
  patientName: string;
  documents: { kind: DocumentKind; filename: string }[];
  extraction: Partial<MedicalExtraction>;
  issues: ClaimIssue[];
}

export interface ClaimIssue {
  severity: "error" | "warning" | "ok";
  message: string;
}

export interface ChatMessage {
  role: "user" | "agent";
  text: string;
  at: string;
}

// --- The provider-agnostic AI interface ------------------------------------

export interface AIService {
  readonly name: string;
  extractMedicalDocument(text: string): Promise<MedicalExtractionResult>;
  analyzeAssistanceRequest(text: string): Promise<CaseIntakeAnalysis>;
  classifyDocument(text: string, filename?: string): Promise<DocumentKind>;
  answerWithContext(question: string, context: ContextChunk[]): Promise<string>;
  interpretVoiceUtterance(
    utterance: string,
    state: VoiceDialogState
  ): Promise<VoiceNLUResult>;
  summarizeClaim(input: ClaimSummaryInput): Promise<string>;
  summarizeConversation(messages: ChatMessage[]): Promise<string>;
}

// --- Notifications (mocked for the demo) -----------------------------------

export interface NotificationService {
  notify(event: {
    kind: "CASE_CREATED" | "APPOINTMENT_BOOKED" | "CLAIM_UPDATED" | "HANDOFF";
    subject: string;
    body: string;
  }): Promise<void>;
}
