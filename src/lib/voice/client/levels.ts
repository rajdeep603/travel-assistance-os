// ---------------------------------------------------------------------------
// Audio levels for the voice visuals: raw RMS from the microphone worklet or
// the playback analyser, turned into a steady 0–1 value the orb can draw.
// Pure functions so the feel can be tuned and tested without audio.
// ---------------------------------------------------------------------------

/** Mic RMS above this means the caller has started talking… */
export const SPEECH_START_RMS = 0.04;
/** …and they count as still talking until it drops below this. */
export const SPEECH_HOLD_RMS = 0.015;

/** Hysteresis, so a pause between words doesn't flicker the state. */
export function nextUserSpeaking(speaking: boolean, rms: number): boolean {
  return rms > SPEECH_START_RMS ? true : speaking && rms > SPEECH_HOLD_RMS;
}

/**
 * Maps RMS (0–1) to a visual level (0–1). Speech sits around 0.03–0.25 RMS;
 * the curve lifts quiet speech so the orb still moves for a soft voice.
 */
export function normalizeLevel(rms: number, full = 0.22): number {
  if (!(rms > 0)) return 0;
  return Math.min(1, Math.pow(rms / full, 0.6));
}

/**
 * Eases a displayed level toward its target over `dt` seconds: it rises fast
 * (attack) and falls slowly (release), the way a VU meter feels natural.
 */
export function smoothLevel(current: number, target: number, dt: number, attack = 0.05, release = 0.22): number {
  const tau = target > current ? attack : release;
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / tau));
}
