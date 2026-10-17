// Agent ids needed without loading the agents (client code, metrics).

/** The internal assistant's voice mode. */
export const ASSISTANT_AGENT_ID = "internal-assistant";

/** Agents that talk to colleagues, not callers: their sessions stay out of the Call Center (lists, metrics, search). */
export const INTERNAL_AGENT_IDS = [ASSISTANT_AGENT_ID];
