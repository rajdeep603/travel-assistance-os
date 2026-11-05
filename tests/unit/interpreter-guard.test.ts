import { describe, expect, it } from "vitest";
import { isNonSpeech } from "@/lib/voice/interpreter";
import { NoiseGate, PCM16_CODEC } from "@/lib/voice/noise-gate";

// The interpreter's two guards: a model that decides not to translate answers
// with a note, which is never spoken; and the gates follow the speaker's own
// level, so a hall's chatter can't keep a turn open for ever.

describe("notes the interpreter never speaks", () => {
  it("are bracketed asides, ellipses and nothing", () => {
    for (const t of ["(no response)", "(silencio)", "[silence]", "*no speech*", "…", "...", "", "  "]) expect(isNonSpeech(t), t).toBe(true);
    for (const t of ["Necesitamos su informe médico.", "Good morning.", "No.", "Sí, claro."]) expect(isNonSpeech(t), t).toBe(false);
  });
});

/** A 40 ms PCM16 chunk at 24 kHz whose RMS is about `level`. */
const chunk = (level: number) => {
  const b = Buffer.alloc(960 * 2);
  for (let i = 0; i < 960; i++) b.writeInt16LE(Math.round(level * Math.SQRT2 * Math.sin((i / 960) * Math.PI * 2 * 12)), i * 2);
  return b;
};
const passed = (out: Buffer[]) => out.some((f) => PCM16_CODEC.rms(f) > 0);

describe("speaker-relative gate", () => {
  it("passes the speaker and hides chatter well below their voice", () => {
    const gate = new NoiseGate({ codec: PCM16_CODEC, frameMs: 40, windowFrames: 50, relative: { open: 0.3, close: 0.2 } });
    // Quiet room, then the speaker talks for a second: their level is learnt.
    for (let i = 0; i < 25; i++) gate.process(chunk(80));
    for (let i = 0; i < 25; i++) expect(passed(gate.process(chunk(3000)))).toBe(true);
    // They stop; chatter at a sixth of their level, with gaps, goes on.
    let leaked = 0;
    for (let i = 0; i < 100; i++) if (passed(gate.process(chunk(i % 5 === 0 ? 80 : 500)))) leaked += 1;
    // Only the hangover just after they stopped gets through.
    expect(leaked).toBeLessThanOrEqual(10);
    // The speaker again: through at once.
    expect(passed(gate.process(chunk(2800)))).toBe(true);
  });

  it("without the relative option, chatter with gaps opens the gate (the hotline's behaviour is unchanged)", () => {
    const gate = new NoiseGate({ codec: PCM16_CODEC, frameMs: 40, windowFrames: 50 });
    for (let i = 0; i < 25; i++) gate.process(chunk(80));
    for (let i = 0; i < 25; i++) gate.process(chunk(3000));
    let leaked = 0;
    for (let i = 0; i < 100; i++) if (passed(gate.process(chunk(i % 5 === 0 ? 80 : 500)))) leaked += 1;
    expect(leaked).toBeGreaterThan(50);
  });
});
