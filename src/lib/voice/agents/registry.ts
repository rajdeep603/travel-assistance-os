import { appointmentBookingAgent } from "./appointment-booking";
import { inboundHotlineAgent } from "./inbound-hotline";
import { internalAssistantAgent } from "./internal-assistant";
import { OUTBOUND_AGENTS } from "./outbound";
import { providerLineAgent } from "./provider-line";
import type { AgentProfile } from "./types";

/**
 * Marker profile for interpreter-bridge legs. The bridge runs its own
 * translation sessions (src/lib/voice/interpreter.ts); this entry only lets
 * calls, tickets and the Call Center refer to it.
 */
export const interpreterProfile: AgentProfile = {
  id: "interpreter",
  label: "Live interpreter",
  description: "Interprets a call between a case manager (browser) and a foreign hospital (phone), both ways, in real time.",
  direction: "outbound",
  channels: ["PHONE", "BROWSER"],
  audience: "provider",
  voice: "ara",
  tools: [],
  maxSeconds: 20 * 60,
  reasoningEffort: "none",
  openingCue: "",
  instructions: () => "",
};

const PROFILES = new Map<string, AgentProfile>(
  [appointmentBookingAgent, inboundHotlineAgent, providerLineAgent, ...OUTBOUND_AGENTS, interpreterProfile, internalAssistantAgent].map((p) => [p.id, p])
);

/** Adds profiles (later phases register the hotline and outbound agents). */
export function registerAgents(profiles: AgentProfile[]): void {
  for (const p of profiles) PROFILES.set(p.id, p);
}

export function getAgent(id: string): AgentProfile | undefined {
  return PROFILES.get(id);
}

/** The call agents; the internal assistant talks to colleagues, not callers, so it isn't listed. */
export function listAgents(): AgentProfile[] {
  return [...PROFILES.values()].filter((p) => !p.internal);
}

export { INTERNAL_AGENT_IDS } from "./ids";

export const DEFAULT_BROWSER_AGENT = appointmentBookingAgent.id;
