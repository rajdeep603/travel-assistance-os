import { describe, expect, it } from "vitest";
import { CASES } from "../../prisma/seed-data";
import { LEAD_SEGMENTS } from "@/lib/meeting-notes";
import { getAgent } from "@/lib/voice/agents/registry";
import { HOTLINE_SCRIPTS } from "@/lib/voice/call-scripts";
import { DEMO_TRACKS, demoTrack, trackAgents } from "@/lib/voice/demo-runs";
import { VOICE_LANGUAGES } from "@/lib/voice/languages";

// The 15-minute demo runs: one per kind of prospect, each step on a seeded case
// (or invoice) its agent fits, with lines for the presenter to say.

describe("demo runs", () => {
  it("has a run for every lead segment, three or four steps long, within fifteen minutes", () => {
    for (const seg of LEAD_SEGMENTS) {
      const track = demoTrack(seg.id);
      expect(track, seg.id).not.toBeNull();
      expect(track!.steps.length).toBeGreaterThanOrEqual(3);
      expect(track!.steps.length).toBeLessThanOrEqual(4);
      expect(track!.steps.reduce((n, s) => n + s.minutes, 0), `${seg.id} minutes`).toBeLessThanOrEqual(15);
      expect(track!.closeOn.length).toBeGreaterThan(10);
    }
    expect(demoTrack("nobody")).toBeNull();
  });

  it("runs every step on a registered browser agent, a seeded case or invoice, and gives the presenter lines", () => {
    const caseRefs = new Set(CASES.map((c) => c.ref));
    const scriptIds = new Set(HOTLINE_SCRIPTS.map((s) => s.id));
    const languages = new Set(VOICE_LANGUAGES.map((l) => l.name));
    for (const track of DEMO_TRACKS) {
      const ids = track.steps.map((s) => s.id);
      expect(new Set(ids).size, `${track.id} step ids`).toBe(ids.length);
      for (const step of track.steps) {
        const where = `${track.id}/${step.id}`;
        const profile = getAgent(step.agentId);
        expect(profile, where).toBeDefined();
        expect(profile!.channels, where).toContain("BROWSER");
        if (profile!.requiresCase) expect(step.caseRef, `${where} needs a case`).toBeDefined();
        if (step.caseRef) expect(caseRefs.has(step.caseRef), `${where} ${step.caseRef}`).toBe(true);
        if (step.record) expect(step.record, where).toMatch(/^RCV-\d{4}$/);
        if (step.scriptId) expect(scriptIds.has(step.scriptId), `${where} ${step.scriptId}`).toBe(true);
        if (step.language) expect(languages.has(step.language), `${where} ${step.language}`).toBe(true);
        expect(Boolean(step.cues?.length || step.scriptId), `${where} has lines to say`).toBe(true);
        expect(step.notice.length, where).toBeGreaterThan(20);
        expect(step.youPlay.length, where).toBeGreaterThan(5);
      }
    }
  });

  it("knows which agents a run needs prepared: the ones calling about a case or an invoice", () => {
    const hospital = demoTrack("hospital")!;
    expect(trackAgents(hospital)).toEqual(["outbound-payment-followup", "outbound-hospital-coordination", "outbound-medical-transport"]);
    expect(trackAgents(demoTrack("assistance")!)).not.toContain("inbound-hotline");
  });
});
