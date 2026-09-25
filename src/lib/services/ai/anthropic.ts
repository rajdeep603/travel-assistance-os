import Anthropic from "@anthropic-ai/sdk";
import type { DocumentKind } from "@prisma/client";
import { env } from "@/lib/env";
import type {
  AIService,
  CaseIntakeAnalysis,
  ChatMessage,
  ClaimSummaryInput,
  ContextChunk,
  MedicalExtractionResult,
  VoiceDialogState,
  VoiceNLUResult,
} from "../types";

// ---------------------------------------------------------------------------
// Live AI provider backed by the Anthropic API. Only used when AI_API_KEY is
// configured; every method throws on failure so the resilient wrapper can
// fall back to the deterministic demo provider.
// ---------------------------------------------------------------------------

const DOCUMENT_KINDS: DocumentKind[] = [
  "MEDICAL_REPORT",
  "HOSPITAL_INVOICE",
  "PRESCRIPTION",
  "DISCHARGE_SUMMARY",
  "OTHER",
];

export class AnthropicAIService implements AIService {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  private async completeJSON<T>(system: string, user: string): Promise<T> {
    const res = await this.client.messages.create({
      model: env.aiModel,
      max_tokens: 1500,
      system: `${system}\nRespond with a single valid JSON object and nothing else.`,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned no JSON object");
    return JSON.parse(match[0]) as T;
  }

  private async completeText(system: string, user: string): Promise<string> {
    const res = await this.client.messages.create({
      model: env.aiModel,
      max_tokens: 800,
      system,
      messages: [{ role: "user", content: user }],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }

  async extractMedicalDocument(text: string): Promise<MedicalExtractionResult> {
    return this.completeJSON<MedicalExtractionResult>(
      `You extract structured data from medical documents for a travel assistance company.
Return JSON: {"extraction": {"patientName","dateOfBirth","hospital","doctor","diagnosis","symptoms":[],"admissionDate","dischargeDate","procedures":[],"medications":[],"invoiceAmount":number|null,"currency","policyReference"}, "summary": string, "missingInfo": string[], "confidence": number 0-1}.
Use null for absent scalar fields and [] for absent lists. missingInfo lists gaps a claims handler would care about (e.g. "Policy number missing").`,
      text.slice(0, 12000)
    );
  }

  async analyzeAssistanceRequest(text: string): Promise<CaseIntakeAnalysis> {
    return this.completeJSON<CaseIntakeAnalysis>(
      `You analyse incoming travel assistance requests.
Return JSON: {"patient","location","country","medicalIssue","symptoms":[],"assistanceType":"MEDICAL|DENTAL|HOSPITALIZATION|EVACUATION|REPATRIATION|GENERAL","urgency":"LOW|MEDIUM|HIGH|CRITICAL","requestedAction","existingCaseRef","summary","suggestedActions":[]}.
suggestedActions are concrete next steps for a case manager.`,
      text.slice(0, 4000)
    );
  }

  async classifyDocument(text: string, filename = ""): Promise<DocumentKind> {
    const out = await this.completeJSON<{ kind: string }>(
      `Classify the medical document. Return JSON {"kind": one of ${DOCUMENT_KINDS.join(", ")}}.`,
      `Filename: ${filename}\n\n${text.slice(0, 4000)}`
    );
    return DOCUMENT_KINDS.includes(out.kind as DocumentKind)
      ? (out.kind as DocumentKind)
      : "OTHER";
  }

  async answerWithContext(question: string, context: ContextChunk[]): Promise<string> {
    const ctx = context
      .map((c, i) => `[${i + 1}] ${c.title}\n${c.content}`)
      .join("\n\n---\n\n");
    return this.completeText(
      `You are the internal assistant of a travel assistance company. Answer strictly from the provided knowledge base extracts. If the answer is not in them, say so. Be concise and operational.`,
      `Knowledge base extracts:\n\n${ctx}\n\nQuestion: ${question}`
    );
  }

  async interpretVoiceUtterance(
    utterance: string,
    state: VoiceDialogState
  ): Promise<VoiceNLUResult> {
    return this.completeJSON<VoiceNLUResult>(
      `You are the NLU of a voice medical assistance agent. Extract only what the utterance states.
Return JSON: {"info": {subset of {"name","location","problem","specialty","preferredDate":"YYYY-MM-DD","preferredTime","language","contact"}}, "selectedOption": number|null, "confirmation": "yes"|"no"|null}.
Today is ${new Date().toISOString().slice(0, 10)}. Dialog step: ${state.step}. The agent last asked for: ${state.expecting ?? "nothing specific"}.`,
      utterance
    );
  }

  async summarizeClaim(input: ClaimSummaryInput): Promise<string> {
    return this.completeText(
      `Summarise this insurance claim for a human reviewer in 3-4 sentences. Mention documents on file and blocking issues.`,
      JSON.stringify(input)
    );
  }

  async summarizeConversation(messages: ChatMessage[]): Promise<string> {
    return this.completeText(
      `Summarise this voice assistance conversation for a human case manager in 2-3 sentences.`,
      messages.map((m) => `${m.role}: ${m.text}`).join("\n")
    );
  }
}
