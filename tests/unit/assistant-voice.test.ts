import { describe, expect, it } from "vitest";
import { threadTitle } from "@/lib/services/assistant-history";
import { followUpCaseRef, retrievalQuery } from "@/lib/services/assistant";
import type { AssistantTurn } from "@/lib/services/types";
import { internalAssistantAgent } from "@/lib/voice/agents/internal-assistant";
import { getAgent, listAgents } from "@/lib/voice/agents/registry";
import { initialVoiceState, voiceReducer } from "@/lib/voice/client/use-grok-voice";
import { normalizeRef, pageFor } from "@/lib/voice/tools/assistant";

// The internal assistant's memory and voice mode: what a follow-up refers
// to, how conversations are titled, and what the voice agent may open.

const history: AssistantTurn[] = [
  { role: "user", text: "What is the status of CASE-1024?" },
  { role: "assistant", text: "CASE-1024 — Chest pain in Kadikoy. Status: IN PROGRESS…" },
];

describe("follow-up questions", () => {
  it("takes a case question about “it” to the case just discussed", () => {
    expect(followUpCaseRef("Who is it assigned to?", history)).toBe("CASE-1024");
    expect(followUpCaseRef("What's the status of the case now?", history)).toBe("CASE-1024");
    expect(followUpCaseRef("When is its next appointment?", history)).toBe("CASE-1024");
  });

  it("leaves new questions alone", () => {
    expect(followUpCaseRef("What documents are required for a hospitalization?", history)).toBeNull();
    expect(followUpCaseRef("Where do they send the invoices?", history)).toBeNull();
    expect(followUpCaseRef("Who is it assigned to?", [])).toBeNull();
  });

  it("searches the knowledge base with the previous question for a short follow-up", () => {
    const earlier: AssistantTurn[] = [
      { role: "user", text: "What documents are required for a hospitalization case?" },
      { role: "assistant", text: "A medical report, …" },
    ];
    expect(retrievalQuery("And for outpatients?", earlier)).toBe("What documents are required for a hospitalization case? And for outpatients?");
    expect(retrievalQuery("When does a claim need to be escalated?", earlier)).toBe("When does a claim need to be escalated?");
    expect(retrievalQuery("And for outpatients?", [])).toBe("And for outpatients?");
  });
});

describe("conversation titles", () => {
  it("uses the first question, cut at a word", () => {
    expect(threadTitle("  What is the status of\nCASE-1024? ")).toBe("What is the status of CASE-1024?");
    const long = threadTitle("What documents are required for a hospitalization case when the patient is admitted overnight?");
    expect(long).toBe("What documents are required for a hospitalization case when…");
    expect(long.length).toBeLessThanOrEqual(61);
    expect(threadTitle("   ")).toBe("New conversation");
  });
});

describe("voice mode", () => {
  it("is an internal agent, kept off the call agents' lists", () => {
    expect(getAgent("internal-assistant")).toBe(internalAssistantAgent);
    expect(listAgents().map((a) => a.id)).not.toContain("internal-assistant");
    expect(internalAssistantAgent).toMatchObject({ internal: true, channels: ["BROWSER"] });
    expect(internalAssistantAgent.tools).toEqual(["search_knowledge", "lookup_case", "search_records", "find_providers", "open_record", "end_call"]);
  });

  it("carries on from what was typed before voice was switched on", () => {
    const ctx = { callRef: "CALL-1100", channel: "BROWSER" as const, today: "2026-10-17", weekday: "Saturday", time: "10:00" };
    const prompt = internalAssistantAgent.instructions({
      ...ctx,
      brief: { earlier_in_this_conversation: [{ who: "operator", said: "What is the status of CASE-1024?" }, { who: "assistant", said: "In progress." }] },
    });
    expect(prompt).toContain("## Conversation so far");
    expect(prompt).toContain("Operator: What is the status of CASE-1024?");
    expect(prompt).toContain("Assistant: In progress.");
    expect(internalAssistantAgent.instructions(ctx)).not.toContain("## Conversation so far");
  });

  it("reads spoken references and module names", () => {
    expect(normalizeRef("case 1022")).toBe("CASE-1022");
    expect(normalizeRef("CASE1022")).toBe("CASE-1022");
    expect(normalizeRef("log-0902")).toBe("LOG-0902");
    expect(normalizeRef("Lena Koch")).toBe("LENA KOCH");
    expect(pageFor("the inbox")).toEqual({ href: "/inbox", label: "the inbox" });
    expect(pageFor("Call Center")).toMatchObject({ href: "/calls" });
    expect(pageFor("CASE-1022")).toBeNull();
  });

  it("only follows the agent to pages inside the app", () => {
    const live = { ...initialVoiceState, phase: "live" as const };
    const opened = voiceReducer(live, { type: "event", event: { type: "navigate", href: "/cases/abc", label: "CASE-1022" } });
    expect(opened.navigate).toMatchObject({ href: "/cases/abc", label: "CASE-1022" });
    for (const href of ["https://evil.example", "//evil.example/x", "javascript:alert(1)"]) {
      expect(voiceReducer(live, { type: "event", event: { type: "navigate", href } }).navigate).toBeNull();
    }
  });
});
