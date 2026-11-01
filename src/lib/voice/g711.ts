// ---------------------------------------------------------------------------
// G.711 μ-law, the codec of a Twilio Media Stream (8 kHz, one byte a sample):
// what phone legs carry, what the bridge measures, and what its own tones use.
// ---------------------------------------------------------------------------

const BIAS = 0x84;
const CLIP = 32635;

/** The μ-law byte for silence (a zero sample). */
export const MULAW_SILENCE = 0xff;

/** 16-bit linear → μ-law. */
export function linearToMulaw(sample: number): number {
  let s = Math.max(-32768, Math.min(32767, Math.round(sample)));
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; exponent--, mask >>= 1);
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** μ-law → 16-bit linear. */
export function mulawToLinear(byte: number): number {
  const b = ~byte & 0xff;
  const sign = b & 0x80;
  const exponent = (b >> 4) & 0x07;
  const mantissa = b & 0x0f;
  const magnitude = (((mantissa << 3) + BIAS) << exponent) - BIAS;
  return sign ? -magnitude : magnitude;
}

const TABLE = Int16Array.from({ length: 256 }, (_, b) => mulawToLinear(b));

/** The RMS level of a μ-law frame on the 16-bit scale (0 for silence, about 32767 for a full-scale square wave). */
export function mulawRms(frame: Uint8Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const s = TABLE[frame[i]];
    sum += s * s;
  }
  return Math.sqrt(sum / frame.length);
}
