import type { AudioFormat } from "../realtime/xai-session";

/**
 * One side of a voice session: where caller audio comes from and agent audio
 * goes. A browser tab (PCM 24 kHz) or a Twilio phone call (G.711 μ-law 8 kHz);
 * the model session is configured with the leg's formats, so audio passes
 * through untouched.
 */
export interface VoiceLeg {
  readonly kind: "browser" | "twilio";
  readonly format: AudioFormat;
  /** Caller audio, base64 in `format`. */
  onAudio(handler: (base64: string) => void): void;
  /** Typed input (browser text box); phone legs never emit it. */
  onText(handler: (text: string) => void): void;
  /** Keypad digits (phone legs only). */
  onDtmf(handler: (digit: string) => void): void;
  onClose(handler: (reason: string) => void): void;
  /** Agent audio, base64 in `format`. */
  sendAudio(base64: string): void;
  /** Drop queued agent audio immediately (the caller started talking). */
  clearPlayback(): void;
  /** Resolves once everything sent so far has been played to the caller. */
  awaitPlayback(timeoutMs?: number): Promise<void>;
  /** UI events (transcripts, tool activity); ignored by phone legs. */
  sendEvent(event: Record<string, unknown>): void;
  close(reason: string): void;
}
