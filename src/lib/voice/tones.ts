// ---------------------------------------------------------------------------
// Tones a phone leg can play itself, without the voice model: G.711 μ-law at
// 8 kHz, base64, in the 20 ms frames Twilio Media Streams expect. The one in
// use tells a caller the line is open when the agent is told to stay quiet
// (a presenter reading an inbound demo script): they hear the tone, then speak.
// ---------------------------------------------------------------------------

import { MULAW_SILENCE, linearToMulaw } from "./g711";

const RATE = 8000;
const FRAME = 160; // 20 ms at 8 kHz

/** A sine note with short fades, as μ-law bytes. */
function note(frequencyHz: number, ms: number, amplitude: number): Uint8Array {
  const n = Math.round((RATE * ms) / 1000);
  const ramp = Math.round(RATE * 0.012);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / ramp, (n - 1 - i) / ramp);
    out[i] = linearToMulaw(Math.sin((2 * Math.PI * frequencyHz * i) / RATE) * amplitude * 32767 * env);
  }
  return out;
}

const silence = (ms: number) => new Uint8Array(Math.round((RATE * ms) / 1000)).fill(MULAW_SILENCE);

function frames(bytes: Uint8Array): string[] {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += FRAME) out.push(Buffer.from(bytes.subarray(i, i + FRAME)).toString("base64"));
  return out;
}

const READY_TONE = frames(Buffer.concat([silence(120), note(880, 170, 0.28), silence(60)]));

/** "The line is open": a short soft note, as media frames for a phone leg. */
export function readyTone(): string[] {
  return READY_TONE;
}
