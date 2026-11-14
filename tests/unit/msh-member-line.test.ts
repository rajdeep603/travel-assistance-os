import { describe, expect, it } from "vitest";
import { getAgent, listAgents } from "@/lib/voice/agents/registry";
import { mshMemberLineAgent } from "@/lib/voice/agents/msh";
import type { AgentContext } from "@/lib/voice/agents/types";
import { fullNameMatches, memberDigits, nameWords } from "@/lib/voice/tools/msh";
import { realtimeTools } from "@/lib/voice/tools/registry";
import { toolChipLabel } from "@/lib/voice/tool-labels";

// The member line that works in the client's own CRM (MSH Americas POC).

const ctx = (brief: Record<string, unknown>, language?: string): AgentContext => ({ callRef: "CALL-1600", channel: "BROWSER", today: "2026-11-19", weekday: "Thursday", time: "18:30", brief, language: language ?? null });

describe("MSH member line agent", () => {
  it("is API-only, inbound, and has every tool it names", () => {
    expect(getAgent("inbound-msh-member-line")?.id).toBe("inbound-msh-member-line");
    expect(mshMemberLineAgent.apiOnly).toBe(true);
    expect(mshMemberLineAgent.direction).toBe("inbound");
    expect(listAgents().some((a) => a.id === mshMemberLineAgent.id)).toBe(false);
    expect(() => realtimeTools(mshMemberLineAgent.tools)).not.toThrow();
    for (const tool of mshMemberLineAgent.tools) expect(toolChipLabel(tool)).not.toMatch(/_/);
  });

  it("discloses the AI and the recording, keeps the CRM address out of the prompt, and never says Magento", () => {
    const prompt = mshMemberLineAgent.instructions(ctx({ client: "MSH Americas", assistant_name: "MSH Assistant", local_time: "Thursday 10:30 in Toronto", _crm_url: "https://msh.example/api/crm" }));
    expect(prompt).toMatch(/You're speaking with the MSH Assistant, an AI assistant, and this call is recorded/);
    expect(prompt).not.toContain("msh.example");
    expect(prompt).not.toMatch(/magento/i);
    expect(prompt).toMatch(/Thursday 10:30 in Toronto/);
    expect(prompt).toMatch(/verify_member_identity returns verified true/);
  });

  it("opens in Canadian French when asked, with the company name untranslated", () => {
    const prompt = mshMemberLineAgent.instructions(ctx({ client: "MSH Americas" }, "French"));
    expect(prompt).toMatch(/Canadian French/);
    expect(prompt).toMatch(/Merci d'avoir appelé le service aux membres de MSH Americas/);
    expect(prompt).toMatch(/not "MSH Amériques"/);
  });
});

describe("three-factor identity", () => {
  it("reads member numbers as heard, in English or French", () => {
    expect(memberDigits("MSH-410-287")).toBe("410287");
    expect(memberDigits("M S H four one zero two eight seven")).toBe("410287");
    expect(memberDigits("M S H quatre un zéro neuf zéro trois")).toBe("410903");
    expect(memberDigits("MSH 411 018")).toBe("411018");
  });

  it("needs the first name and the surname, forgiving a garbled letter", () => {
    expect(fullNameMatches("Sarah Okafor", "Sarah Okafor")).toBe(true);
    expect(fullNameMatches("Ms Sara Okafore", "Sarah Okafor")).toBe(true);
    expect(fullNameMatches("Elodie Gagnon", "Élodie Gagnon")).toBe(true);
    expect(fullNameMatches("Ahmed Al Mansouri", "Ahmed Al-Mansouri")).toBe(true);
    expect(fullNameMatches("Ahmed Almansouri", "Ahmed Al-Mansouri")).toBe(true);
    expect(fullNameMatches("Okafor", "Sarah Okafor")).toBe(false);
    expect(fullNameMatches("Priya Raman", "Sarah Okafor")).toBe(false);
    expect(fullNameMatches("Karim Hadid", "Karim Haddad")).toBe(true);
    expect(fullNameMatches("Kevin Haddad", "Karim Haddad")).toBe(false);
  });

  it("drops titles in English and French", () => {
    expect(nameWords("Mme Élodie Gagnon")).toEqual(["elodie", "gagnon"]);
    expect(nameWords("Mr. Karim Haddad")).toEqual(["karim", "haddad"]);
  });
});
