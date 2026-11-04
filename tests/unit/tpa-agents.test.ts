import { describe, expect, it } from "vitest";
import { getAgent, listAgents } from "@/lib/voice/agents/registry";
import { TPA_AGENTS, memberLineAgent, payerInvoiceAgent, providerDocumentsAgent } from "@/lib/voice/agents/tpa";
import type { AgentContext } from "@/lib/voice/agents/types";
import { findClaim } from "@/lib/voice/tools/tpa";
import { realtimeTools } from "@/lib/voice/tools/registry";
import { toolChipLabel } from "@/lib/voice/tool-labels";

// The claims-administration agents (Global Excel POC): API-only, identity a
// tool gate on the member line, the hidden brief keys never printed.

const ctx = (brief: Record<string, unknown>, language?: string): AgentContext => ({ callRef: "CALL-1400", channel: "PHONE", today: "2026-11-05", weekday: "Thursday", time: "09:30", brief, language: language ?? null });

const claims = [
  { ref: "GEM-240311", member: "Margaret Thompson", dob: "1962-05-18" },
  { ref: "GEM-240318", member: "David Chen", dob: "1978-11-03" },
];

describe("finding the member's claim", () => {
  it("by the reference as heard, or by the surname when there is none", () => {
    expect(findClaim(claims, "G E M two four zero three one eight")?.ref).toBe("GEM-240318");
    expect(findClaim(claims, "0318")?.ref).toBe("GEM-240318");
    expect(findClaim(claims, undefined, "David Chen")?.ref).toBe("GEM-240318");
    expect(findClaim(claims, undefined, "Margaret Tomson")?.ref).toBe("GEM-240311");
    expect(findClaim(claims, "999999")).toBeNull();
    expect(findClaim(claims, undefined, "Someone Else")).toBeNull();
  });
});

describe("claims-administration agents", () => {
  it("are API-only, kept out of the pickers, and have every tool they name", () => {
    for (const agent of TPA_AGENTS) {
      expect(agent.apiOnly).toBe(true);
      expect(getAgent(agent.id)?.id).toBe(agent.id);
      expect(listAgents().some((a) => a.id === agent.id)).toBe(false);
      expect(() => realtimeTools(agent.tools)).not.toThrow();
      for (const tool of agent.tools) expect(toolChipLabel(tool)).not.toMatch(/_/);
    }
    expect(memberLineAgent.direction).toBe("inbound");
    expect(providerDocumentsAgent.direction).toBe("outbound");
    expect(payerInvoiceAgent.direction).toBe("outbound");
  });

  it("disclose the AI and the recording, and never translate the company name", () => {
    for (const agent of TPA_AGENTS) {
      const prompt = agent.instructions(ctx({ client: "Global Excel", assistant_name: "the Global Excel Assistant" }, "Spanish"));
      expect(prompt).toMatch(/AI assistant/);
      expect(prompt).toMatch(/recorded/);
      expect(prompt).toMatch(/never translate it/);
      expect(prompt).toMatch(/G E M, two four zero, three one one/);
    }
  });

  it("keep the member's date of birth and the claim facts out of the instructions", () => {
    const prompt = memberLineAgent.instructions(ctx({ client: "Global Excel", _cases: claims, _collector_number: "+15555550100" }));
    expect(prompt).not.toContain("1978-11-03");
    expect(prompt).not.toContain("GEM-240318");
    expect(prompt).not.toContain("+15555550100");
    expect(prompt).toMatch(/NEVER discuss a claim before verify_member/);
  });
});
