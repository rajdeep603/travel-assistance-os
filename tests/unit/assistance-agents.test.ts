import { describe, expect, it } from "vitest";
import { ASSISTANCE_AGENTS, bedAcceptanceAgent, benefitVerificationAgent, emergencyIntakeAgent, missedCallReturnAgent } from "@/lib/voice/agents/assistance";
import { getAgent, listAgents } from "@/lib/voice/agents/registry";
import type { AgentContext } from "@/lib/voice/agents/types";
import { realtimeTools } from "@/lib/voice/tools/registry";
import { toolChipLabel } from "@/lib/voice/tool-labels";

// The agents added after ITIC 2026: what the booth conversations asked for.

const ctx = (brief?: Record<string, unknown>): AgentContext => ({ callRef: "CALL-1300", channel: "PHONE", today: "2026-11-04", weekday: "Wednesday", time: "10:00", brief: brief ?? null });

describe("post-ITIC agents", () => {
  it("are registered, offered in the pickers, and have every tool they name", () => {
    for (const agent of ASSISTANCE_AGENTS) {
      expect(getAgent(agent.id)?.id).toBe(agent.id);
      expect(listAgents().some((a) => a.id === agent.id), agent.id).toBe(true);
      expect(() => realtimeTools(agent.tools)).not.toThrow();
      for (const tool of agent.tools) expect(toolChipLabel(tool)).not.toMatch(/_/);
    }
  });

  it("checks cover without ever asserting it", () => {
    const prompt = benefitVerificationAgent.instructions(ctx({ patient: "Oliver Bennett", policy_number: "POL-TR-100941" }));
    expect(prompt).toMatch(/AI assistant/);
    expect(prompt).toMatch(/NEVER claim cover the desk didn't confirm/);
    expect(prompt).toContain("POL-TR-100941");
    expect(benefitVerificationAgent.requiresCase).toBe(true);
  });

  it("puts danger and location first on the emergency line", () => {
    const prompt = emergencyIntakeAgent.instructions(ctx());
    expect(prompt).toMatch(/immediate danger/);
    expect(prompt).toMatch(/ALWAYS take the location/);
    expect(prompt).toMatch(/2,500 m/);
    expect(emergencyIntakeAgent.direction).toBe("inbound");
    expect(emergencyIntakeAgent.tools).toContain("create_case");
  });

  it("never promises an arrival time to the receiving hospital", () => {
    const prompt = bedAcceptanceAgent.instructions(ctx({ patient: "Lena Koch" }));
    expect(prompt).toMatch(/NEVER promise an arrival time/);
    expect(bedAcceptanceAgent.tools).toContain("record_bed_acceptance");
  });

  it("returns a missed call with the hotline's tools and no case", async () => {
    expect(missedCallReturnAgent.requiresCase).toBeFalsy();
    const brief = await missedCallReturnAgent.buildRecordBrief!(null);
    expect(String(brief.missed_call)).toMatch(/minutes ago/);
    expect((await missedCallReturnAgent.fitRecord!(null)).ready).toBe(true);
    for (const tool of ["check_coverage", "search_providers", "book_appointment", "find_my_case"]) expect(missedCallReturnAgent.tools).toContain(tool);
    expect(missedCallReturnAgent.instructions(ctx(brief))).toMatch(/ALWAYS say why you are calling/);
  });
});
