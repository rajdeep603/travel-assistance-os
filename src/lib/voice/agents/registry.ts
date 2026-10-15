import { appointmentBookingAgent } from "./appointment-booking";
import { inboundHotlineAgent } from "./inbound-hotline";
import { OUTBOUND_AGENTS } from "./outbound";
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
  [appointmentBookingAgent, inboundHotlineAgent, ...OUTBOUND_AGENTS, interpreterProfile].map((p) => [p.id, p])
);

/** Adds profiles (later phases register the hotline and outbound agents). */
export function registerAgents(profiles: AgentProfile[]): void {
  for (const p of profiles) PROFILES.set(p.id, p);
}

export function getAgent(id: string): AgentProfile | undefined {
  return PROFILES.get(id);
}

export function listAgents(): AgentProfile[] {
  return [...PROFILES.values()];
}

export const DEFAULT_BROWSER_AGENT = appointmentBookingAgent.id;
