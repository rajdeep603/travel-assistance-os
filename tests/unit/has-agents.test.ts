import { describe, expect, it } from "vitest";
import { HAS_AGENTS, hasAssistanceLineAgent } from "@/lib/voice/agents/has";
import { getAgent, listAgents } from "@/lib/voice/agents/registry";
import type { AgentContext } from "@/lib/voice/agents/types";
import { voucherDigits } from "@/lib/voice/tools/has";
import { realtimeTools } from "@/lib/voice/tools/registry";
import { toolChipLabel } from "@/lib/voice/tool-labels";

// HAS Companies: the traveller line, the clinic booking call and the follow-up.

const ctx = (brief: Record<string, unknown>, language?: string): AgentContext => ({ callRef: "CALL-1700", channel: "PHONE", today: "2026-11-17", weekday: "Tuesday", time: "14:00", brief, language: language ?? null });

describe("HAS agents", () => {
  it("are API-only, registered, hidden from the pickers, and have every tool they name", () => {
    for (const agent of HAS_AGENTS) {
      expect(getAgent(agent.id)?.id).toBe(agent.id);
      expect(agent.apiOnly).toBe(true);
      expect(listAgents().some((a) => a.id === agent.id)).toBe(false);
      expect(() => realtimeTools(agent.tools)).not.toThrow();
      for (const tool of agent.tools) expect(toolChipLabel(tool)).not.toMatch(/_/);
    }
  });

  it("keeps the connector address out of the instructions and greets in Spanish", () => {
    const text = hasAssistanceLineAgent.instructions(ctx({ client: "Health Access Services", _crm_url: "https://example.test/api/caretrail/connector" }, "Spanish"));
    expect(text).not.toContain("example.test");
    expect(text).toContain("asistencia al viajero");
    expect(text).toContain("Latin American Spanish");
  });

  it("reads voucher numbers given in words or digits", () => {
    expect(voucherDigits("AV-482117")).toBe("482117");
    expect(voucherDigits("A V cuatro ocho dos uno uno siete")).toBe("482117");
    expect(voucherDigits("V S quatro oito dois um um sete")).toBe("482117");
    expect(voucherDigits("")).toBe("");
  });
});
