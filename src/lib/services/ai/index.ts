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
import { MockAIService } from "./mock";
import { AnthropicAIService } from "./anthropic";

/**
 * Wraps a primary AI provider with the deterministic demo provider as a
 * fallback, so an external AI outage never breaks a demo workflow.
 */
class ResilientAIService implements AIService {
  readonly name: string;

  constructor(
    private primary: AIService,
    private fallback: AIService
  ) {
    this.name = `${primary.name}+fallback`;
  }

  private async tryBoth<T>(
    op: string,
    fn: (svc: AIService) => Promise<T>
  ): Promise<T> {
    try {
      return await fn(this.primary);
    } catch (err) {
      console.warn(
        `[ai] primary provider "${this.primary.name}" failed for ${op}; using fallback:`,
        err instanceof Error ? err.message : err
      );
      return fn(this.fallback);
    }
  }

  extractMedicalDocument(text: string): Promise<MedicalExtractionResult> {
    return this.tryBoth("extractMedicalDocument", (s) => s.extractMedicalDocument(text));
  }
  analyzeAssistanceRequest(text: string): Promise<CaseIntakeAnalysis> {
    return this.tryBoth("analyzeAssistanceRequest", (s) => s.analyzeAssistanceRequest(text));
  }
  classifyDocument(text: string, filename?: string): Promise<DocumentKind> {
    return this.tryBoth("classifyDocument", (s) => s.classifyDocument(text, filename));
  }
  answerWithContext(question: string, context: ContextChunk[]): Promise<string> {
    return this.tryBoth("answerWithContext", (s) => s.answerWithContext(question, context));
  }
  interpretVoiceUtterance(u: string, st: VoiceDialogState): Promise<VoiceNLUResult> {
    return this.tryBoth("interpretVoiceUtterance", (s) => s.interpretVoiceUtterance(u, st));
  }
  summarizeClaim(input: ClaimSummaryInput): Promise<string> {
    return this.tryBoth("summarizeClaim", (s) => s.summarizeClaim(input));
  }
  summarizeConversation(messages: ChatMessage[]): Promise<string> {
    return this.tryBoth("summarizeConversation", (s) => s.summarizeConversation(messages));
  }
}

let instance: AIService | null = null;

/** Returns the configured AI service (live provider + fallback, or demo provider). */
export function getAIService(): AIService {
  if (!instance) {
    const mock = new MockAIService();
    instance = env.aiApiKey
      ? new ResilientAIService(new AnthropicAIService(env.aiApiKey), mock)
      : mock;
  }
  return instance;
}

/** Test hook. */
export function resetAIService(): void {
  instance = null;
}
