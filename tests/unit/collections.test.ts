import { describe, expect, it } from "vitest";
import { COLLECTION_AGENTS, debtCollectionAgent, debtorLineAgent, guaranteeCollectionAgent } from "@/lib/voice/agents/collections";
import type { AgentContext } from "@/lib/voice/agents/types";
import { dobMatches, findCase, parseDob } from "@/lib/voice/tools/collections";
import { realtimeTools } from "@/lib/voice/tools/registry";

// The collection agents (a debt-collection client's calls through the public
// API): identity is a tool gate, the hidden brief keys stay hidden, and the
// regulated-call rules are in every prompt.

const ctx = (brief: Record<string, unknown>): AgentContext => ({ callRef: "CALL-1200", channel: "PHONE", today: "2026-11-04", weekday: "Wednesday", time: "10:00", brief, language: "Arabic" });

describe("date of birth matching", () => {
  it("reads spoken and written dates", () => {
    expect(parseDob("14 March 1981")).toBe("1981-03-14");
    expect(parseDob("March 14th, 1981")).toBe("1981-03-14");
    expect(parseDob("14/03/1981")).toBe("1981-03-14");
    expect(parseDob("1981-03-14")).toBe("1981-03-14");
    expect(parseDob("the 2nd of September 1975")).toBe("1975-09-02");
    expect(parseDob("yesterday")).toBeNull();
  });

  it("matches only the same day, month and year", () => {
    expect(dobMatches("14 March 1981", "1981-03-14")).toBe(true);
    expect(dobMatches("14 March 1982", "1981-03-14")).toBe(false);
    expect(dobMatches("", "1981-03-14")).toBe(false);
    expect(dobMatches("14 March 1981", null)).toBe(false);
  });
});

describe("inbound case lookup", () => {
  const cases = [{ ref: "GRA-24015" }, { ref: "GRA-24018" }];
  it("finds the case by its reference however it was heard", () => {
    expect(findCase(cases, "GRA-24018")?.ref).toBe("GRA-24018");
    expect(findCase(cases, "gra 24018")?.ref).toBe("GRA-24018");
    expect(findCase(cases, "24018")?.ref).toBe("GRA-24018");
    expect(findCase(cases, "4018")?.ref).toBe("GRA-24018");
    expect(findCase(cases, "99999")).toBeNull();
    expect(findCase(cases, undefined)).toBeNull();
  });
});

describe("collection agents", () => {
  it("are API-only and carry the regulated-call rules", () => {
    for (const agent of COLLECTION_AGENTS) {
      expect(agent.apiOnly).toBe(true);
      const prompt = agent.instructions(ctx({ client: "Global Recovery Alliance", case_ref: "GRA-24015" }));
      expect(prompt).toMatch(/AI assistant/);
      expect(prompt).toMatch(/recorded/);
      expect(prompt).toMatch(/Never threaten/i);
    }
    expect(debtCollectionAgent.direction).toBe("outbound");
    expect(guaranteeCollectionAgent.direction).toBe("outbound");
    expect(debtorLineAgent.direction).toBe("inbound");
  });

  it("never prints the hidden brief keys", () => {
    const prompt = debtCollectionAgent.instructions(
      ctx({ client: "Global Recovery Alliance", calling: "Mr Ahmed Al Harbi", _identity: { dob: "1981-03-14" }, _debt: { amount: "£8,450", hospital: "Northgate General Hospital" } })
    );
    expect(prompt).toContain("Mr Ahmed Al Harbi");
    expect(prompt).not.toContain("1981-03-14");
    expect(prompt).not.toContain("8,450");
    expect(prompt).not.toContain("Northgate");
  });

  it("uses the brief's company and assistant names", () => {
    const prompt = debtorLineAgent.instructions(ctx({ client: "Acme Recovery", assistant_name: "Acme Assistant", _cases: [] }));
    expect(prompt).toContain("Acme Recovery");
    expect(prompt).toContain("Acme Assistant");
    expect(prompt).not.toContain("_cases");
  });

  it("has every tool it names", () => {
    for (const agent of COLLECTION_AGENTS) expect(() => realtimeTools(agent.tools)).not.toThrow();
  });
});
