import type { ChatMessage } from "@/lib/services/types";

export type VoiceChannel = "PHONE" | "BROWSER";

/** Facts known when a session starts, woven into the agent's instructions. */
export interface AgentContext {
  callRef: string;
  channel: VoiceChannel;
  /** Istanbul wall-clock "now". */
  today: string; // YYYY-MM-DD
  weekday: string; // e.g. "Friday"
  time: string; // HH:MM
  linkedCase?: {
    ref: string;
    title: string;
    patientName: string;
    location: string;
    status: string;
  } | null;
  /** Free-form facts for outbound calls (who to call, what to ask). */
  brief?: Record<string, unknown> | null;
  /** Language the operator chose for this session (English name), if any. */
  language?: string | null;
}

export interface AgentGuardrails {
  /** What it never does, beyond the rules every agent shares (BASE_NEVER). */
  never: string[];
  /** When, and to whom, it hands the call to a person. */
  handsOver: string[];
}

/**
 * A voice agent is data: who it is (instructions, voice), what it may do
 * (tools) and its limits. The same profile runs on the phone and in a browser.
 */
export interface AgentProfile {
  id: string;
  label: string;
  description: string;
  direction: "inbound" | "outbound";
  channels: VoiceChannel[];
  voice: string;
  languageHint?: string;
  tools: string[];
  /** Hard stop for the session (cost and safety cap). */
  maxSeconds: number;
  /**
   * Its limits in plain words, for people judging the agent ("How this agent
   * works" on the Voice Agents page). The instructions are what enforce them.
   */
  guardrails?: AgentGuardrails;
  reasoningEffort?: "high" | "none";
  /** Recognition hints beyond the defaults (districts, refs). */
  keyterms?: string[];
  /** Cue that makes the agent speak first. */
  openingCue: string;
  instructions(ctx: AgentContext): string;
  /** Outbound only: who is called. */
  audience?: "traveller" | "provider";
  /** Outbound only: needs a case to call about. */
  requiresCase?: boolean;
  /** Outbound only: facts for the agent, built from the case before dialling. */
  buildBrief?(caseId: string): Promise<Record<string, unknown>>;
  /** Outbound only: the number to suggest (patient's or provider's phone). */
  suggestNumber?(caseId: string): Promise<string | null>;
  /**
   * Talks to the operations team, not to callers (the internal assistant):
   * kept out of the Call Center's lists, live board and metrics.
   */
  internal?: boolean;
  /** Runs when the session ends, before the browser is told; e.g. to save the transcript elsewhere. */
  afterSession?(session: { callRef: string; outcome: Record<string, unknown>; messages: ChatMessage[] }): Promise<void>;
}
