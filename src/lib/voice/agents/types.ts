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
}
