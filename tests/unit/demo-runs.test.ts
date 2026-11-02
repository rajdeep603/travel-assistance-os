import { describe, expect, it } from "vitest";
import { CASES } from "../../prisma/seed-data";
import { LEAD_SEGMENTS } from "@/lib/meeting-notes";
import { getAgent } from "@/lib/voice/agents/registry";
import { HOTLINE_SCRIPTS } from "@/lib/voice/call-scripts";
import { DEMO_TRACKS, demoStep, demoTrack, rehearsalNote, stepCues, stepKeyterms, stepNames, trackAgents } from "@/lib/voice/demo-runs";
import { VOICE_LANGUAGES } from "@/lib/voice/languages";

// The 15-minute demo runs: one per kind of prospect, each step on a seeded case
// (or invoice) its agent fits, with lines for the presenter to say. Nothing in
// them is a note to the presenter: the prospect watches the screen they're on.

describe("demo runs", () => {
  it("has a run for every lead segment, three or four steps long, within fifteen minutes", () => {
    for (const seg of LEAD_SEGMENTS) {
      const track = demoTrack(seg.id);
      expect(track, seg.id).not.toBeNull();
      expect(track!.steps.length).toBeGreaterThanOrEqual(3);
      expect(track!.steps.length).toBeLessThanOrEqual(4);
      expect(track!.steps.reduce((n, s) => n + s.minutes, 0), `${seg.id} minutes`).toBeLessThanOrEqual(15);
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
        expect(stepCues(step).length, `${where} has lines to say`).toBeGreaterThan(0);
        expect(step.youPlay.length, where).toBeGreaterThan(5);
      }
    }
  });

  it("finds a step by run and id, with the lines it reads: its own, or its hotline script's", () => {
    const hospitalLine = demoStep("insurer", "hospital-line")!.step;
    expect(hospitalLine.agentId).toBe("inbound-provider-line");
    expect(stepCues(hospitalLine)[0].say).toMatch(/Marmara Heart Center/);
    const logCheck = demoStep("insurer", "log-check")!.step;
    expect(stepCues(logCheck)).toBe(logCheck.cues);
    expect(demoStep("insurer", "nope")).toBeNull();
    expect(demoStep(null, "hospital-line")).toBeNull();
  });

  it("briefs the agent on a step rung on a real phone: who the presenter plays and the exchange, in order", () => {
    const note = rehearsalNote(demoStep("hospital", "coordination")!.step);
    expect(note).toContain("presenter playing The admissions desk");
    expect(note).toMatch(/1\. They say: "Admissions, good morning\." You then: Says it's an AI/);
    expect(note.indexOf("1. They say")).toBeLessThan(note.indexOf("2. They say"));
    expect(note).toContain("Never say their lines");
    expect(note).toContain("Every fact still comes from your tools");
    // The presenter knows it's a demonstration, and may pick up with a plain hello.
    expect(note).toContain("don't say so or warn about real medical details");
    expect(note).toContain("only say hello");
    // A hotline step's note reads the script's turns.
    expect(rehearsalNote(demoStep("insurer", "flight-delay")!.step)).toContain("POL-TR-100945");
    // The names the line will garble are spelled out for it.
    expect(rehearsalNote(demoStep("hospital", "hospital-line")!.step)).toContain("Names in this exchange: Marmara Heart Center, Lena Koch, LOG-0902.");
  });

  it("knows the names a step's lines carry, for the agent and the recogniser", () => {
    expect(stepNames(demoStep("hospital", "hospital-line")!.step)).toEqual(["Marmara Heart Center", "Lena Koch", "LOG-0902"]);
    expect(stepKeyterms(demoStep("hospital", "hospital-line")!.step)).toEqual(["Marmara", "Heart", "Center", "Lena", "Koch", "LOG-0902"]);
    const carlos = stepNames(demoStep("assistance", "where-is-my-case")!.step);
    expect(carlos).toContain("Carlos Garcia");
    expect(carlos).toContain("CASE-1015");
    // Sentence openers, contractions and dates aren't names.
    for (const track of DEMO_TRACKS) {
      for (const step of track.steps) {
        for (const name of stepNames(step)) expect(name).not.toMatch(/^(Hello|The|Hi|I'm|I've|He's|She's|What's|July|Much|Nothing|Accounts|Payment|A)$/);
      }
    }
    expect(stepNames(demoStep("hospital", "payer")!.step)).toEqual([]);
  });

  it("knows which agents a run needs prepared: the ones calling about a case or an invoice", () => {
    const hospital = demoTrack("hospital")!;
    expect(trackAgents(hospital)).toEqual(["outbound-payment-followup", "outbound-hospital-coordination", "outbound-medical-transport"]);
    expect(trackAgents(demoTrack("assistance")!)).not.toContain("inbound-hotline");
  });
});
