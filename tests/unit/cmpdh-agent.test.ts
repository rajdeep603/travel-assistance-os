import { describe, expect, it } from "vitest";
import { CMPDH_AGENTS, cmpdhCallCentreAgent } from "@/lib/voice/agents/cmpdh";
import { getAgent, listAgents } from "@/lib/voice/agents/registry";
import type { AgentContext } from "@/lib/voice/agents/types";
import { realtimeTools } from "@/lib/voice/tools/registry";
import { toolChipLabel } from "@/lib/voice/tool-labels";

// Centro Médico Puerta de Hierro: the hospital call centre.

const ctx = (brief: Record<string, unknown>, language?: string): AgentContext => ({ callRef: "CALL-1800", channel: "BROWSER", today: "2026-11-18", weekday: "Wednesday", time: "11:00", brief, language: language ?? null });

describe("CMPDH call centre agent", () => {
  it("is API-only, registered, hidden from the pickers, and has every tool it names", () => {
    for (const agent of CMPDH_AGENTS) {
      expect(getAgent(agent.id)?.id).toBe(agent.id);
      expect(agent.apiOnly).toBe(true);
      expect(listAgents().some((a) => a.id === agent.id)).toBe(false);
      expect(() => realtimeTools(agent.tools)).not.toThrow();
      for (const tool of agent.tools) expect(toolChipLabel(tool)).not.toMatch(/_/);
    }
  });

  it("keeps the connector address out of the instructions and greets in Spanish", () => {
    const text = cmpdhCallCentreAgent.instructions(ctx({ client: "Centro Médico Puerta de Hierro", _crm_url: "https://example.test/api/caretrail/connector", _collector_number: "+5233" }, "Spanish"));
    expect(text).not.toContain("example.test");
    expect(text).not.toContain("+5233");
    expect(text).toContain("asistente virtual de Puerta de Hierro");
    expect(text).toContain("Mexican Spanish");
  });
});
