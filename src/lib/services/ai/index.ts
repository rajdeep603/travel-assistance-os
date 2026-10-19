import { AsyncLocalStorage } from "node:async_hooks";
import type { DocumentKind } from "@prisma/client";
import { env } from "@/lib/env";
import type {
  AIService,
  AISource,
  CaseIntakeAnalysis,
  ChatMessage,
  ClaimSummaryInput,
  AssistantTurn,
  ContextChunk,
  ConversationSummaryContext,
  DocumentFile,
  MedicalExtractionResult,
} from "../types";
import { MockAIService } from "./mock";
import { AnthropicAIService } from "./anthropic";

interface Providers {
  primary: AIService | null;
  fallback: AIService;
}

let providers: Providers | null = null;

function getProviders(): Providers {
  if (!providers) {
    providers = {
      primary: env.aiApiKey ? new AnthropicAIService(env.aiApiKey) : null,
      fallback: new MockAIService(),
    };
  }
  return providers;
}

const offlineScope = new AsyncLocalStorage<true>();

/**
 * Runs fn with every AI operation inside it on the offline rules, even when
 * a live model is configured: the demo's own sample files keep the figures a
 * presenter has rehearsed (see src/lib/samples/fingerprints.ts).
 */
export function withOfflineAI<T>(fn: () => Promise<T>): Promise<T> {
  return offlineScope.run(true, fn);
}

/**
 * Runs an AI operation on the live provider, falling back to the
 * deterministic demo provider on any failure (timeout, refusal, invalid
 * output), and reports which one produced the result.
 */
export async function runAI<T>(
  op: string,
  fn: (svc: AIService) => Promise<T>
): Promise<{ value: T; source: AISource }> {
  const { primary, fallback } = getProviders();
  if (primary && !offlineScope.getStore()) {
    try {
      return { value: await fn(primary), source: "claude" };
    } catch (err) {
      console.warn(
        `[ai] live provider failed for ${op}; using offline rules:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return { value: await fn(fallback), source: "offline" };
}

/**
 * AIService facade over runAI for callers that only need the value, so an
 * external AI outage never breaks a demo workflow.
 */
class ResilientAIService implements AIService {
  readonly name = "resilient";

  private async run<T>(op: string, fn: (svc: AIService) => Promise<T>): Promise<T> {
    return (await runAI(op, fn)).value;
  }

  extractMedicalDocument(text: string): Promise<MedicalExtractionResult> {
    return this.run("extractMedicalDocument", (s) => s.extractMedicalDocument(text));
  }
  analyzeAssistanceRequest(text: string): Promise<CaseIntakeAnalysis> {
    return this.run("analyzeAssistanceRequest", (s) => s.analyzeAssistanceRequest(text));
  }
  classifyDocument(text: string, filename?: string): Promise<DocumentKind> {
    return this.run("classifyDocument", (s) => s.classifyDocument(text, filename));
  }
  answerWithContext(question: string, context: ContextChunk[], history?: AssistantTurn[]): Promise<string> {
    return this.run("answerWithContext", (s) => s.answerWithContext(question, context, history));
  }
  summarizeClaim(input: ClaimSummaryInput): Promise<string> {
    return this.run("summarizeClaim", (s) => s.summarizeClaim(input));
  }
  summarizeConversation(messages: ChatMessage[], context?: ConversationSummaryContext): Promise<string> {
    return this.run("summarizeConversation", (s) => s.summarizeConversation(messages, context));
  }
  readDocument(file: DocumentFile): Promise<{ text: string; language: string | null }> {
    return this.run("readDocument", (s) => s.readDocument(file));
  }
  translateText(text: string, targetLanguage: string): Promise<string> {
    return this.run("translateText", (s) => s.translateText(text, targetLanguage));
  }
}

let instance: AIService | null = null;

/** Returns the configured AI service (live provider + fallback, or demo provider). */
export function getAIService(): AIService {
  if (!instance) {
    instance = getProviders().primary ? new ResilientAIService() : getProviders().fallback;
  }
  return instance;
}

/** Whether a live model is configured (for UI labelling). */
export function aiMode(): { mode: AISource; model: string | null } {
  return getProviders().primary
    ? { mode: "claude", model: env.aiModel }
    : { mode: "offline", model: null };
}

/** Test hook. */
export function resetAIService(): void {
  instance = null;
  providers = null;
}
