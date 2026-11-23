import { describe, expect, it } from "vitest";
import { organoLeadCallbackAgent, organoSalesLineAgent } from "@/lib/voice/agents/organo";
import { getAgent, listAgents } from "@/lib/voice/agents/registry";
import type { AgentContext } from "@/lib/voice/agents/types";
import { realtimeTools } from "@/lib/voice/tools/registry";
import { toolChipLabel } from "@/lib/voice/tool-labels";

// Organo Eco Habitats' lead call-back and sales line, working in Organo's own sales system (the Organo POC).

const ctx = (brief: Record<string, unknown>, language?: string): AgentContext => ({ callRef: "CALL-1800", channel: "PHONE", today: "2026-11-24", weekday: "Tuesday", time: "11:00", brief, language: language ?? null });
const BRIEF = {
  client: "Organo Eco Habitats",
  assistant_name: "Meera",
  local_time: "Tuesday 24 November 2026, afternoon in Hyderabad",
  call_reason: "website_callback",
  lead: { ref: "OL-2041", name: "Priya Reddy", address_as: "Ms Reddy", first_name: "Priya", project_interest: "Kandawada", source: "Website, 'Get a call' on the Kandawada page", asked_at: "about a minute ago" },
  projects: ["Kandawada (near Chevella): 3 BHK farm villas, from ₹10.5 Cr"],
  sales_only: "Payment plans, loans, possession dates: the relationship manager.",
  _crm_url: "https://organo.example/api/crm",
  _collector_number: "+919800000000",
};

describe("Organo agents", () => {
  it("are API-only, registered, and have every tool they name, with readable labels", () => {
    for (const agent of [organoLeadCallbackAgent, organoSalesLineAgent]) {
      expect(getAgent(agent.id)?.id).toBe(agent.id);
      expect(agent.apiOnly).toBe(true);
      expect(agent.channels).toEqual(["PHONE", "BROWSER"]);
      expect(listAgents().some((a) => a.id === agent.id)).toBe(false);
      expect(() => realtimeTools(agent.tools)).not.toThrow();
      for (const tool of agent.tools) expect(toolChipLabel(tool)).not.toMatch(/_/);
    }
    expect(organoLeadCallbackAgent.direction).toBe("outbound");
    expect(organoSalesLineAgent.direction).toBe("inbound");
  });

  it("the call-back confirms the person before saying why, discloses the AI and keeps the system addresses out", () => {
    const prompt = organoLeadCallbackAgent.instructions(ctx(BRIEF));
    expect(prompt).toMatch(/Hello, am I speaking with Priya\?/);
    expect(prompt).toMatch(/Meera, Organo's AI assistant/);
    expect(prompt).toMatch(/you asked for a call about Kandawada on Organo's website about a minute ago/);
    expect(prompt).toMatch(/This call is recorded/);
    expect(prompt).not.toContain("organo.example");
    expect(prompt).not.toContain("+919800000000");
    expect(prompt).toMatch(/Open in English\. If the other person answers in Hindi or Telugu/);
  });

  it("Auto opens in the brief's opening language (Telugu) and switches to the caller's", () => {
    const callback = organoLeadCallbackAgent.instructions(ctx({ ...BRIEF, opening_language: "Telugu" }));
    expect(callback).toMatch(/Open in Telugu, the language most callers here speak/);
    expect(callback).toMatch(/If the other person answers in English or Hindi/);
    expect(callback).toContain("నేను Priya గారితో మాట్లాడుతున్నానా?");
    const line = organoSalesLineAgent.instructions(ctx({ ...BRIEF, lead: undefined, call_reason: undefined, opening_language: "Telugu" }));
    expect(line).toContain("Organo Eco Habitats కి కాల్ చేసినందుకు ధన్యవాదాలు");
    // A language chosen for the call wins over the opening language.
    expect(organoSalesLineAgent.instructions(ctx({ ...BRIEF, opening_language: "Telugu" }, "English"))).toMatch(/Language for this call: English/);
  });

  it("the Expo call talks about the registration and the Westin", () => {
    const prompt = organoLeadCallbackAgent.instructions(ctx({ ...BRIEF, call_reason: "expo_registration", lead: { ...BRIEF.lead, expo: { day: "Saturday 12 December", budget_band: "3–4 Cr" } } }));
    expect(prompt).toMatch(/registered for Organo's Rurban Home Expo at the Westin for Saturday 12 December/);
    expect(prompt).toMatch(/expo_confirmed/);
  });

  it("the sales line greets with the disclosure and records the caller before booking", () => {
    const prompt = organoSalesLineAgent.instructions(ctx({ ...BRIEF, lead: undefined, call_reason: undefined }, "Hindi"));
    expect(prompt).toMatch(/Thank you for calling Organo Eco Habitats\. I'm Meera, Organo's AI assistant, and this call is recorded/);
    expect(prompt).toMatch(/Language for this call: Hindi/);
    expect(prompt).toMatch(/save_lead_profile with lead_ref null/);
    expect(prompt).toMatch(/homeowner_service/);
    expect(prompt).not.toContain("organo.example");
  });
});
