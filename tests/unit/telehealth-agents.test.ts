import { describe, expect, it } from "vitest";
import { getAgent, listAgents } from "@/lib/voice/agents/registry";
import { TELEHEALTH_AGENTS, benefitCheckAgent, patientLineAgent } from "@/lib/voice/agents/telehealth";
import type { AgentContext } from "@/lib/voice/agents/types";
import { INTERPRETER_LANGUAGES, interpreterOpening, languageHintOf } from "@/lib/voice/interpreter-prompt";
import { realtimeTools } from "@/lib/voice/tools/registry";
import { toolChipLabel } from "@/lib/voice/tool-labels";

// The telehealth contact-centre agents (EverHealth POC) and the interpreter
// with a Spanish-speaking agent on the browser side.

const ctx = (brief: Record<string, unknown>, language?: string): AgentContext => ({ callRef: "CALL-1500", channel: "PHONE", today: "2026-11-10", weekday: "Tuesday", time: "18:30", brief, language: language ?? null });

describe("telehealth agents", () => {
  it("are API-only, kept out of the pickers, and have every tool they name", () => {
    for (const agent of TELEHEALTH_AGENTS) {
      expect(agent.apiOnly).toBe(true);
      expect(getAgent(agent.id)?.id).toBe(agent.id);
      expect(listAgents().some((a) => a.id === agent.id)).toBe(false);
      expect(() => realtimeTools(agent.tools)).not.toThrow();
      for (const tool of agent.tools) expect(toolChipLabel(tool)).not.toMatch(/_/);
    }
    expect(benefitCheckAgent.direction).toBe("outbound");
    expect(patientLineAgent.direction).toBe("inbound");
  });

  it("disclose the AI and the recording, use the client's name, and hide the private brief keys", () => {
    for (const agent of TELEHEALTH_AGENTS) {
      const prompt = agent.instructions(ctx({ client: "EverHealth", assistant_name: "EverHealth Assistant", _collector_number: "+15555550100" }, "German"));
      expect(prompt).toMatch(/AI assistant/);
      expect(prompt).toMatch(/recorded/);
      expect(prompt).toMatch(/the EverHealth Assistant/);
      expect(prompt).toMatch(/never translate it/);
      expect(prompt).not.toContain("+15555550100");
      expect(prompt).toMatch(/Open in German/);
    }
  });

  it("the benefit check asks about every code and records before ending", () => {
    const prompt = benefitCheckAgent.instructions(ctx({ client: "EverHealth", services: [{ code: "99213" }, { code: "71046" }] }));
    expect(prompt).toContain("99213");
    expect(prompt).toMatch(/ALWAYS ask about every code/);
    expect(prompt).toMatch(/record_benefit_check/);
  });

  it("the patient line puts danger first", () => {
    expect(patientLineAgent.instructions(ctx({ client: "EverHealth" }))).toMatch(/Danger first/);
  });
});

describe("interpreter with a Spanish-speaking agent", () => {
  it("knows Mexican Spanish and hints it as Spanish", () => {
    expect(INTERPRETER_LANGUAGES["es-MX"]).toBe("Mexican Spanish");
    expect(languageHintOf("es-MX")).toBe("es-ES");
    expect(languageHintOf("de")).toBe("de");
  });

  it("opens in the agent's own language, naming the client", () => {
    expect(interpreterOpening("es-MX", "EverHealth", "CareTrail")).toMatch(/^Hola, le llamo de EverHealth/);
    expect(interpreterOpening("en", "Global Excel", "CareTrail")).toMatch(/^Hello, I'm calling from Global Excel/);
    expect(interpreterOpening("en", null, "CareTrail")).toMatch(/CareTrail travel assistance/);
  });
});
