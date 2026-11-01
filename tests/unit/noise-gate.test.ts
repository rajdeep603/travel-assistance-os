import { describe, expect, it } from "vitest";
import { MULAW_SILENCE, linearToMulaw, mulawRms, mulawToLinear } from "@/lib/voice/g711";
import { NoiseGate } from "@/lib/voice/noise-gate";

// The noise gate on phone legs: hall chatter is replaced by silence, a voice
// passes untouched (with the frames just before it), dips inside a sentence
// don't close it, and nothing above a modest level is ever hidden.

/** A 20 ms μ-law frame of a 440 Hz tone at a linear amplitude (RMS ≈ amplitude / √2). */
function tone(amplitude: number, phase = 0): Buffer {
  const out = Buffer.alloc(160);
  for (let i = 0; i < 160; i++) out[i] = linearToMulaw(Math.sin(phase + (2 * Math.PI * 440 * i) / 8000) * amplitude);
  return out;
}
const silence = Buffer.alloc(160, MULAW_SILENCE);
const isSilence = (f: Buffer) => f.equals(silence);

describe("G.711 μ-law", () => {
  it("round-trips samples and measures levels", () => {
    expect(mulawToLinear(MULAW_SILENCE)).toBe(0);
    expect(mulawToLinear(linearToMulaw(-32000))).toBeLessThan(-30000);
    expect(Math.abs(mulawToLinear(linearToMulaw(1000)) - 1000)).toBeLessThan(40);
    expect(mulawRms(silence)).toBe(0);
    expect(mulawRms(tone(3000))).toBeGreaterThan(2000);
    expect(mulawRms(tone(3000))).toBeLessThan(2250);
  });
});

describe("noise gate", () => {
  it("replaces steady hall noise with silence", () => {
    const gate = new NoiseGate();
    const out = Array.from({ length: 100 }, (_, i) => gate.process(tone(300, i))).flat();
    expect(out).toHaveLength(100);
    expect(out.every(isSilence)).toBe(true);
    expect(gate.isOpen).toBe(false);
    expect(gate.hiddenFrames).toBe(100);
  });

  it("lets a voice through untouched, preceded by the frames just before it", () => {
    const gate = new NoiseGate();
    for (let i = 0; i < 50; i++) gate.process(tone(300, i));
    const first = tone(3000);
    const opened = gate.process(first);
    // Up to 200 ms of pre-roll (real audio, not silence), then the frame itself.
    expect(opened.length).toBe(11);
    expect(opened.slice(0, 10).every((f) => !isSilence(f) && mulawRms(f) < 400)).toBe(true);
    expect(opened.at(-1)!.equals(first)).toBe(true);
    const next = tone(3000, 1);
    expect(gate.process(next)).toEqual([next]);
    expect(gate.isOpen).toBe(true);
  });

  it("stays open across the dips inside a sentence and closes after a real pause, keeping the tail", () => {
    const gate = new NoiseGate();
    for (let i = 0; i < 50; i++) gate.process(tone(300, i));
    for (let i = 0; i < 10; i++) gate.process(tone(3000, i));
    // A 200 ms dip (an unvoiced consonant) is shorter than the hangover.
    const dip = Array.from({ length: 10 }, (_, i) => gate.process(tone(400, i))).flat();
    expect(dip.every((f) => !isSilence(f))).toBe(true);
    expect(gate.isOpen).toBe(true);
    for (let i = 0; i < 10; i++) gate.process(tone(3000, i));
    // Then the room again: the first 320 ms still pass (the end of the last word), the rest is silence.
    const after = Array.from({ length: 40 }, (_, i) => gate.process(tone(300, i))).flat();
    expect(after.slice(0, 16).every((f) => !isSilence(f))).toBe(true);
    expect(after.slice(17).every(isSilence)).toBe(true);
    expect(gate.isOpen).toBe(false);
  });

  it("never hides a voice above about -25 dBFS, however loud the room", () => {
    const gate = new NoiseGate();
    // Noise louder than the floor cap is hidden only while it stays under the cap's margin...
    for (let i = 0; i < 100; i++) gate.process(tone(2000, i));
    expect(gate.floor).toBe(700);
    // ...and a voice at -22 dBFS passes.
    const voice = tone(3000);
    expect(gate.process(voice).at(-1)!.equals(voice)).toBe(true);
    expect(gate.isOpen).toBe(true);
  });

  it("asks for a clearer voice while the agent is speaking, so chatter can't cut it off", () => {
    const relaxed = new NoiseGate();
    const strict = new NoiseGate();
    strict.setStrict(true);
    for (let i = 0; i < 50; i++) {
      relaxed.process(tone(300, i));
      strict.process(tone(300, i));
    }
    const burst = tone(900);
    expect(relaxed.process(burst).at(-1)!.equals(burst)).toBe(true);
    expect(isSilence(strict.process(burst)[0])).toBe(true);
    // Once the agent has finished, the same level gets through.
    strict.setStrict(false);
    expect(strict.process(burst).at(-1)!.equals(burst)).toBe(true);
  });
});
