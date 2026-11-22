import { describe, expect, it } from "vitest";
import { heroHospitalLineAgent, heroTravellerLineAgent } from "@/lib/voice/agents/hero";
import { getAgent, listAgents } from "@/lib/voice/agents/registry";
import type { AgentContext } from "@/lib/voice/agents/types";
import { documentDigits, fullNameMatches, nameWords } from "@/lib/voice/tools/hero";
import { realtimeTools } from "@/lib/voice/tools/registry";
import { toolChipLabel } from "@/lib/voice/tool-labels";

// Hero Seguros' traveller line and hospital line, working in Hero's own system (the Hero Assist POC).

const ctx = (brief: Record<string, unknown>, language?: string): AgentContext => ({ callRef: "CALL-1700", channel: "BROWSER", today: "2026-11-23", weekday: "Monday", time: "11:00", brief, language: language ?? null });
const BRIEF = { client: "Hero Seguros", service: "Hero Assist", local_time: "Monday 23 November 2026, morning in São Paulo", care_promise: "within 30 minutes", _crm_url: "https://hero.example/api/crm" };

describe("Hero agents", () => {
  it("are API-only, inbound, and have every tool they name, with readable labels", () => {
    for (const agent of [heroTravellerLineAgent, heroHospitalLineAgent]) {
      expect(getAgent(agent.id)?.id).toBe(agent.id);
      expect(agent.apiOnly).toBe(true);
      expect(agent.direction).toBe("inbound");
      expect(listAgents().some((a) => a.id === agent.id)).toBe(false);
      expect(() => realtimeTools(agent.tools)).not.toThrow();
      for (const tool of agent.tools) expect(toolChipLabel(tool)).not.toMatch(/_/);
    }
  });

  it("the traveller line opens in Brazilian Portuguese, discloses the AI and keeps the system address out", () => {
    const prompt = heroTravellerLineAgent.instructions(ctx(BRIEF));
    expect(prompt).toMatch(/Aqui é a assistente virtual da Hero, uma inteligência artificial, e esta ligação é gravada/);
    expect(prompt).toMatch(/Open in Brazilian Portuguese/);
    expect(prompt).not.toContain("hero.example");
    expect(prompt).toMatch(/Monday 23 November 2026, morning in São Paulo/);
    expect(prompt).toMatch(/verify_traveller returns verified true/);
    expect(prompt).toMatch(/policy number .*OR their CPF/);
  });

  it("the hospital line greets in English or the hospital's language and never issues a guarantee", () => {
    const prompt = heroHospitalLineAgent.instructions(ctx(BRIEF, "Italian"));
    expect(prompt).toMatch(/Language for this call: Italian/);
    expect(prompt).toMatch(/Parla con l'assistente virtuale di Hero/);
    expect(prompt).toMatch(/NEVER issue or promise a guarantee of payment/);
    expect(prompt).not.toContain("hero.example");
    expect(prompt).not.toMatch(/quatro oito dois/);
  });
});

describe("identification on policy number or CPF", () => {
  it("reads policy numbers and CPFs as heard, in Portuguese, Spanish, English or Italian", () => {
    expect(documentDigits("HR-482-115")).toBe("482115");
    expect(documentDigits("H R quatro oito dois um um cinco")).toBe("482115");
    expect(documentDigits("H R cuatro ocho dos, uno uno cinco")).toBe("482115");
    expect(documentDigits("318.442.706-15")).toBe("31844270615");
    expect(documentDigits("H R five seven one, three four two")).toBe("571342");
    expect(documentDigits("H R cinque sette uno tre quattro due")).toBe("571342");
  });

  it("needs the first name and the surname, without titles or particles", () => {
    expect(nameWords("Sra. Ana Beatriz da Rocha")).toEqual(["ana", "beatriz", "rocha"]);
    expect(fullNameMatches("Mariana Costa", "Mariana Costa")).toBe(true);
    expect(fullNameMatches("senhora Mariana Costa", "Mariana Costa")).toBe(true);
    expect(fullNameMatches("Ana Rocha", "Ana Beatriz Rocha")).toBe(true);
    expect(fullNameMatches("Sofia Martinez", "Sofía Martínez")).toBe(true);
    expect(fullNameMatches("Costa", "Mariana Costa")).toBe(false);
    expect(fullNameMatches("Juliana Costa", "Mariana Costa")).toBe(false);
  });
});
