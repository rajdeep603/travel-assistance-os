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

/** Which provider produced an AI result: the live model or the offline rules. */
export type AISource = "claude" | "offline";

/** One charge row of an invoice or cost estimate. */
export interface InvoiceLine {
  code: string | null;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
}

export interface MedicalExtractionResult {
  extraction: MedicalExtraction;
  /** Invoice, estimate or fatura number. */
  documentNumber?: string | null;
  /** Charge rows of an invoice or estimate (never subtotal, VAT or total rows). */
  lineItems?: InvoiceLine[];
  summary: string;
  missingInfo: string[];
  confidence: number;
  source?: AISource;
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
  source?: AISource;
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
  /** Set when a model wrote the answer (structured DB lookups leave it unset). */
  aiSource?: AISource;
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

/**
 * What the platform already knows about a call when it is summarised, so the
 * summary can lead with what was done rather than retell the transcript.
 */
export interface ConversationSummaryContext {
  /** Structured results the voice tools recorded (Call.outcome). */
  outcome?: Record<string, unknown> | null;
  /** Final call status: COMPLETED, TRANSFERRED, VOICEMAIL, FAILED, … */
  status?: string | null;
  /** Agent profile, e.g. "inbound-hotline" / "24/7 assistance hotline". */
  agentId?: string | null;
  agentLabel?: string | null;
  channel?: "PHONE" | "BROWSER" | null;
  direction?: "inbound" | "outbound" | null;
  /** Outbound calls: who was called. */
  audience?: "traveller" | "provider" | null;
  /** Language of the call (code or name), e.g. "tr" or "English ⇄ Turkish". */
  language?: string | null;
  caseRef?: string | null;
  patientName?: string | null;
  /** Where the traveller is, from the case. */
  location?: string | null;
}

// --- The provider-agnostic AI interface ------------------------------------

export interface AIService {
  readonly name: string;
  extractMedicalDocument(text: string): Promise<MedicalExtractionResult>;
  analyzeAssistanceRequest(text: string): Promise<CaseIntakeAnalysis>;
  classifyDocument(text: string, filename?: string): Promise<DocumentKind>;
  answerWithContext(question: string, context: ContextChunk[]): Promise<string>;
  summarizeClaim(input: ClaimSummaryInput): Promise<string>;
  summarizeConversation(messages: ChatMessage[], context?: ConversationSummaryContext): Promise<string>;
  /** OCR: reads a scanned / faxed / handwritten document that has no text layer. */
  readDocument(file: DocumentFile): Promise<{ text: string; language: string | null }>;
  /** Translates text into the target language (by name, e.g. "English"). */
  translateText(text: string, targetLanguage: string): Promise<string>;
}

export interface DocumentFile {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

// --- Notifications (mocked for the demo) -----------------------------------

export interface NotificationService {
  notify(event: {
    kind: "CASE_CREATED" | "APPOINTMENT_BOOKED" | "CLAIM_UPDATED" | "HANDOFF";
    subject: string;
    body: string;
  }): Promise<void>;
}
