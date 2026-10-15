import { describe, expect, it } from "vitest";
import { nextUserSpeaking, normalizeLevel, smoothLevel } from "@/lib/voice/client/levels";
import { initialVoiceState, voiceReducer, type VoiceState } from "@/lib/voice/client/use-grok-voice";
import { toolSteps } from "@/lib/voice/tool-steps";
import { pipelineReducer, type PipelineState } from "@/lib/client/use-pipeline";

const live = (patch: Partial<VoiceState> = {}): VoiceState => ({ ...initialVoiceState, phase: "live", ...patch });
const event = (e: Record<string, unknown>) => ({ type: "event" as const, event: e as { type: string } });

describe("audio levels", () => {
  it("keeps the caller speaking through a short dip, then lets go", () => {
    expect(nextUserSpeaking(false, 0.03)).toBe(false);
    expect(nextUserSpeaking(false, 0.05)).toBe(true);
    expect(nextUserSpeaking(true, 0.02)).toBe(true);
    expect(nextUserSpeaking(true, 0.01)).toBe(false);
  });

  it("maps RMS to 0–1 and lifts quiet speech", () => {
    expect(normalizeLevel(0)).toBe(0);
    expect(normalizeLevel(Number.NaN)).toBe(0);
    expect(normalizeLevel(1)).toBe(1);
    expect(normalizeLevel(0.03)).toBeGreaterThan(0.03 / 0.22);
    expect(normalizeLevel(0.1)).toBeLessThan(1);
  });

  it("rises faster than it falls", () => {
    const up = smoothLevel(0, 1, 0.05);
    const down = 1 - smoothLevel(1, 0, 0.05);
    expect(up).toBeGreaterThan(down);
    expect(smoothLevel(0.4, 0.4, 0.05)).toBeCloseTo(0.4);
    expect(smoothLevel(0.4, 1, 0)).toBe(0.4);
  });
});

describe("voice session state", () => {
  it("thinks after the caller stops, until the answer starts", () => {
    let s = voiceReducer(live(), event({ type: "agent_thinking" }));
    expect(s.thinking).toBe(true);
    s = voiceReducer(s, event({ type: "transcript_delta", role: "agent", text: "Let me" }));
    expect(s.thinking).toBe(false);
  });

  it("stops thinking when agent audio plays or the caller talks again", () => {
    const thinking = live({ thinking: true });
    expect(voiceReducer(thinking, { type: "speaking", agent: true }).thinking).toBe(false);
    expect(voiceReducer(thinking, event({ type: "user_speaking" })).thinking).toBe(false);
    expect(voiceReducer(thinking, { type: "thinking", on: false }).thinking).toBe(false);
  });

  it("does not think while the agent is already speaking or the session is over", () => {
    expect(voiceReducer(live({ agentSpeaking: true }), event({ type: "agent_thinking" })).thinking).toBe(false);
    expect(voiceReducer({ ...initialVoiceState, phase: "ended" }, event({ type: "agent_thinking" })).thinking).toBe(false);
    expect(voiceReducer(live({ thinking: true }), { type: "ended", reason: "done" }).thinking).toBe(false);
  });

  it("tracks the caller speaking without storing every level", () => {
    const s = voiceReducer(live(), { type: "user_speaking", speaking: true });
    expect(s.userSpeaking).toBe(true);
    expect(voiceReducer(s, { type: "user_speaking", speaking: true })).toBe(s);
  });

  it("gives the agent's final line the id its in-progress caption had", () => {
    let s = voiceReducer(live(), event({ type: "transcript_delta", role: "agent", text: "Hello, " }));
    s = voiceReducer(s, event({ type: "transcript_delta", role: "agent", text: "how can I help?" }));
    const pendingId = s.partialAgentId;
    expect(pendingId).not.toBeNull();
    expect(s.partial.agent).toBe("Hello, how can I help?");
    s = voiceReducer(s, event({ type: "transcript", role: "agent", text: "Hello, how can I help?" }));
    expect(s.transcript.at(-1)).toMatchObject({ id: pendingId, role: "agent" });
    expect(s.partial.agent).toBe("");
    expect(s.partialAgentId).toBeNull();
  });

  it("keeps a tool's id from running to done", () => {
    let s = voiceReducer(live(), event({ type: "tool", name: "search_providers", status: "running" }));
    const id = s.tools[0].id;
    s = voiceReducer(s, event({ type: "tool", name: "search_providers", status: "done" }));
    expect(s.tools).toEqual([{ id, name: "search_providers", status: "done", summary: undefined }]);
  });
});

describe("tool steps", () => {
  it("shows parallel duplicate calls as one step", () => {
    const steps = toolSteps([
      { id: 1, name: "search_providers", status: "done" },
      { id: 2, name: "search_providers", status: "running" },
      { id: 3, name: "book_appointment", status: "running" },
    ]);
    expect(steps).toEqual([
      { id: "1", name: "search_providers", status: "running", summary: undefined },
      { id: "3", name: "book_appointment", status: "running", summary: undefined },
    ]);
  });

  it("fails a step only when every copy failed", () => {
    expect(
      toolSteps([
        { id: 1, name: "create_case", status: "error", summary: "timeout" },
        { id: 2, name: "create_case", status: "done" },
      ])[0].status
    ).toBe("done");
    expect(toolSteps([{ id: 1, name: "create_case", status: "error", summary: "timeout" }])[0]).toMatchObject({
      status: "error",
      summary: "timeout",
    });
  });
});

describe("AI pipeline progress", () => {
  const run = (state: PipelineState, ticks: number, count: number) => {
    let s = state;
    for (let i = 0; i < ticks; i++) s = pipelineReducer(s, { type: "tick", count });
    return s;
  };

  it("holds on the last stage while the request runs", () => {
    const s = run(pipelineReducer({ active: 0, mode: "idle" }, { type: "start" }), 10, 4);
    expect(s).toEqual({ active: 3, mode: "running" });
  });

  it("completes every stage after the answer arrives, then settles", () => {
    let s = run(pipelineReducer({ active: 0, mode: "idle" }, { type: "start" }), 1, 4);
    s = pipelineReducer(s, { type: "finish" });
    expect(s.mode).toBe("finishing");
    s = run(s, 10, 4);
    expect(s).toEqual({ active: 4, mode: "finishing" });
    expect(pipelineReducer(s, { type: "settled" })).toEqual({ active: 0, mode: "idle" });
  });

  it("skips the finish when the request failed", () => {
    const s = pipelineReducer({ active: 2, mode: "running" }, { type: "finish", skip: true });
    expect(s).toEqual({ active: 0, mode: "idle" });
  });

  it("ignores a finish when nothing was running", () => {
    const idle: PipelineState = { active: 0, mode: "idle" };
    expect(pipelineReducer(idle, { type: "finish" })).toBe(idle);
  });
});
