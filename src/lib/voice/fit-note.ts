import type { AgentFit } from "./agents/types";

/**
 * A brief for a case that doesn't fit the agent carries the reason, so the
 * agent says so instead of improvising facts. Starting such a session is a
 * deliberate choice (the Voice Agents page blocks it); real operations may
 * still want the call placed.
 */
export function briefWithFit(brief: Record<string, unknown>, fit: AgentFit | null): Record<string, unknown> {
  if (!fit || fit.ready) return brief;
  return { ...brief, note_for_agent: `${fit.why} Say so plainly, don't improvise facts, and end the call politely.` };
}
