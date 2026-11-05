import { MULAW_SILENCE, mulawRms } from "./g711";

/** How to measure a frame and make silence of its length: μ-law phone frames, or 16-bit PCM browser chunks. */
export interface GateCodec {
  rms(frame: Buffer): number;
  silence(length: number): Buffer;
}

export const MULAW_CODEC: GateCodec = { rms: (f) => mulawRms(f), silence: (n) => Buffer.alloc(n, MULAW_SILENCE) };

/** 16-bit little-endian PCM (the browser's 24 kHz chunks), on the same 16-bit scale as μ-law RMS. */
export const PCM16_CODEC: GateCodec = {
  rms(frame) {
    const n = Math.floor(frame.length / 2);
    if (!n) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = frame.readInt16LE(i * 2);
      sum += v * v;
    }
    return Math.sqrt(sum / n);
  },
  silence: (n) => Buffer.alloc(n, 0),
};

// ---------------------------------------------------------------------------
// An adaptive noise gate for phone legs. In a trade-show hall the chatter
// around the phone must not start turns, cut the agent off (the model treats
// any speech as barge-in) or leave it asking "sorry?". Each 20 ms frame is
// measured; the quietest level of the last two seconds is the noise floor; a
// frame opens the gate only when it is clearly above that floor, and more
// clearly while the agent is speaking. Closed, the model hears silence of the
// same length, so its own turn detection keeps its timing; the frames just
// before the gate opened go first, so the start of a word isn't lost, and it
// stays open across the dips inside a sentence. The floor is capped, so a
// voice above about -25 dBFS always passes: the gate can hide hall noise,
// never a voice held to the phone.
// ---------------------------------------------------------------------------

export interface NoiseGateOptions {
  /** Each frame's length in ms (Twilio sends 20 ms). */
  frameMs?: number;
  /** The floor is the minimum over this many frames (100 = 2 s). */
  windowFrames?: number;
  /** A frame this many times the floor opens the gate. */
  openRatio?: number;
  /** ...and this many times while the agent is speaking (a clear voice interrupts, chatter doesn't). */
  strictRatio?: number;
  /** Below this many times the floor, an open gate starts closing. */
  closeRatio?: number;
  /** How long the gate stays open after the level dropped (the dips inside a sentence). */
  hangoverMs?: number;
  /** How much audio from before the gate opened is sent first. */
  prerollMs?: number;
  /** The floor never goes below this level (a dead-quiet line). */
  floorMin?: number;
  /** ...nor above this one: louder noise is let through rather than risk hiding a voice. */
  floorMax?: number;
  /** The frames' format (μ-law by default). */
  codec?: GateCodec;
  /**
   * Also follow the speaker's own level (the loudest recent speech through the
   * gate, fading over about 20 s) and pass only sound close to it: a voice at
   * the microphone, not people talking a few metres away, whose chatter has
   * gaps the floor alone follows. Fractions of that level to open and to stay
   * open. For the interpreter, where chatter otherwise keeps a turn open for ever.
   */
  relative?: { open: number; close: number };
}

export class NoiseGate {
  private readonly frameMs: number;
  private readonly windowFrames: number;
  private readonly openRatio: number;
  private readonly strictRatio: number;
  private readonly closeRatio: number;
  private readonly hangoverMs: number;
  private readonly prerollFrames: number;
  private readonly floorMin: number;
  private readonly floorMax: number;
  private readonly codec: GateCodec;
  private readonly relative: { open: number; close: number } | null;
  /** The speaker's level (decaying peak of frames that passed), and how much speech it is based on. */
  private voiceLevel = 0;
  private voiceFrames = 0;
  private readonly decay: number;

  private readonly recent: number[] = [];
  private preroll: Buffer[] = [];
  private open = false;
  private strict = false;
  private hang = 0;
  /** Frames hidden so far, for the call's record. */
  private hidden = 0;

  constructor(opts: NoiseGateOptions = {}) {
    this.frameMs = opts.frameMs ?? 20;
    this.windowFrames = opts.windowFrames ?? 100;
    this.openRatio = opts.openRatio ?? 2.5;
    this.strictRatio = opts.strictRatio ?? 3.5;
    this.closeRatio = opts.closeRatio ?? 1.6;
    this.hangoverMs = opts.hangoverMs ?? 320;
    this.prerollFrames = Math.ceil((opts.prerollMs ?? 200) / this.frameMs);
    this.floorMin = opts.floorMin ?? 60;
    this.floorMax = opts.floorMax ?? 700;
    this.codec = opts.codec ?? MULAW_CODEC;
    this.relative = opts.relative ?? null;
    this.decay = Math.pow(0.5, this.frameMs / 20_000);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Time hidden so far, in ms. */
  get hiddenMs(): number {
    return this.hidden * this.frameMs;
  }

  get hiddenFrames(): number {
    return this.hidden;
  }

  /** While the agent is speaking, only a clear voice should get through. */
  setStrict(strict: boolean): void {
    this.strict = strict;
  }

  /** The current noise floor on the 16-bit scale. */
  get floor(): number {
    const min = this.recent.length ? Math.min(...this.recent) : this.floorMin;
    return Math.min(this.floorMax, Math.max(this.floorMin, min));
  }

  /** The frames to forward for one received frame: itself (after any pre-roll), or silence of its length. */
  process(frame: Buffer): Buffer[] {
    const rms = this.codec.rms(frame);
    this.recent.push(rms);
    if (this.recent.length > this.windowFrames) this.recent.shift();
    const floor = this.floor;
    // Relative to the speaker, once enough of their speech has been heard (half a second).
    const known = this.relative && this.voiceFrames * this.frameMs >= 500;
    // The speaker's level fades only while they could be talking (not while the agent or a translation is heard).
    if (!this.strict) this.voiceLevel *= this.decay;
    const openAt = Math.max(floor * (this.strict ? this.strictRatio : this.openRatio), known ? this.voiceLevel * this.relative!.open : 0);
    const closeAt = Math.max(floor * this.closeRatio, known ? this.voiceLevel * this.relative!.close : 0);

    if (this.open) {
      if (rms >= openAt) {
        this.voiceFrames += 1;
        if (rms > this.voiceLevel) this.voiceLevel = rms;
      }
      if (rms < closeAt) {
        this.hang += this.frameMs;
        if (this.hang >= this.hangoverMs) {
          this.open = false;
          this.hang = 0;
        }
      } else {
        this.hang = 0;
      }
      return [frame];
    }

    if (rms >= openAt) {
      this.open = true;
      this.hang = 0;
      const out = [...this.preroll, frame];
      this.preroll = [];
      return out;
    }
    this.preroll.push(frame);
    if (this.preroll.length > this.prerollFrames) this.preroll.shift();
    this.hidden += 1;
    return [this.codec.silence(frame.length)];
  }
}
