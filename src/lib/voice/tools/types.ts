import type { z } from "zod";

/** What a tool may know and do about the live call it runs in. */
export interface ToolContext {
  callId: string;
  callRef: string;
  conversationId: string;
  profileId: string;
  channel: "PHONE" | "BROWSER";
  /** The case this call is working on (opened from a case, or created during the call). */
  caseId: string | null;
  patientId: string | null;
  /** Links the call, its transcript and later tools to a case. */
  setCase(caseId: string, patientId: string): Promise<void>;
  /** Merges structured results into Call.outcome. */
  setOutcome(patch: Record<string, unknown>): Promise<void>;
  /** Pushes an event to the caller's UI (browser) and the live call monitor. */
  emit(event: Record<string, unknown>): void;
  actions: {
    /** Ends the call once the agent's last words have played. */
    hangup(reason: string): Promise<void>;
    /** Hands the caller to a person; resolves with what the agent should say. */
    transfer(target: "doctor" | "case_manager", summary: string): Promise<{ ok: boolean; message: string }>;
  };
}

export interface VoiceTool<S extends z.ZodType = z.ZodType> {
  name: string;
  /** Written for the model: when to call it and what it returns. */
  description: string;
  schema: S;
  execute(args: z.infer<S>, ctx: ToolContext): Promise<Record<string, unknown>>;
}

/** Helper preserving the schema's inferred argument type. */
export function defineTool<S extends z.ZodType>(tool: VoiceTool<S>): VoiceTool<S> {
  return tool;
}
