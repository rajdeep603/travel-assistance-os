"use client";

// ---------------------------------------------------------------------------
// Browser audio for a Grok Voice session: microphone → PCM16 24 kHz chunks
// (AudioWorklet in /worklets/pcm-capture.js), and agent PCM16 24 kHz →
// gapless scheduled playback that can be flushed instantly on barge-in.
// ---------------------------------------------------------------------------

export const VOICE_SAMPLE_RATE = 24_000;

export type MicProblem = "denied" | "no-device" | "busy" | "insecure" | "unsupported";

export class MicError extends Error {
  constructor(readonly problem: MicProblem, message: string) {
    super(message);
  }
}

/** Maps getUserMedia failures to what the person can actually do about them. */
export function classifyMicError(err: unknown): MicError {
  const name = (err as { name?: string })?.name ?? "";
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return new MicError("insecure", "The microphone only works over HTTPS. Open this page via its https:// address.");
  }
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return new MicError(
        "denied",
        "Microphone access is blocked. Click the lock or mic icon in the address bar, allow the microphone for this site, then try again."
      );
    case "NotFoundError":
    case "OverconstrainedError":
    case "DevicesNotFoundError":
      return new MicError("no-device", "No microphone was found. Connect one, or type your messages instead.");
    case "NotReadableError":
    case "AbortError":
    case "TrackStartError":
      return new MicError("busy", "The microphone is in use by another app (a call or recorder?). Close it and try again.");
    case "SecurityError":
      return new MicError("insecure", "The browser blocked the microphone for security reasons. Use the https:// address.");
    default:
      return new MicError("unsupported", "This browser can't capture audio here. Try a current Chrome, Edge, Safari or Firefox.");
  }
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
}

export class VoiceAudio {
  private ctx: AudioContext;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private playing = new Set<AudioBufferSourceNode>();
  private playhead = 0;
  private closed = false;
  /** Agent playback runs through here so the visuals can read its level. */
  private output: GainNode;
  private analyser: AnalyserNode;
  private samples: Float32Array<ArrayBuffer>;
  private micRms = 0;

  onChunk: (base64: string) => void = () => {};
  onLevel: (rms: number) => void = () => {};

  /** Create inside a click handler so the browser allows audio output. */
  constructor() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    void this.ctx.resume();
    this.output = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.samples = new Float32Array(this.analyser.fftSize);
    this.output.connect(this.ctx.destination);
    this.output.connect(this.analyser);
  }

  async startMic(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw classifyMicError({ name: "Unsupported" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (err) {
      throw classifyMicError(err);
    }
    // The session may have ended while the permission prompt was open.
    if (this.closed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    await this.ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
    if (this.closed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture", {
      processorOptions: { targetRate: VOICE_SAMPLE_RATE },
    });
    this.node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      this.micRms = e.data.level;
      this.onLevel(e.data.level);
      this.onChunk(toBase64(e.data.pcm));
    };
    this.source.connect(this.node);
    // Keep the graph pulling without sending the mic to the speakers.
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.node.connect(sink).connect(this.ctx.destination);
  }

  setMuted(muted: boolean): void {
    this.node?.port.postMessage({ muted });
  }

  /** Queues agent audio right after what is already scheduled. */
  play(base64: string): void {
    const pcm = fromBase64(base64);
    if (pcm.length === 0) return;
    const buffer = this.ctx.createBuffer(1, pcm.length, VOICE_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.output);
    const startAt = Math.max(this.ctx.currentTime + 0.03, this.playhead);
    src.start(startAt);
    this.playhead = startAt + buffer.duration;
    this.playing.add(src);
    src.onended = () => this.playing.delete(src);
  }

  /** Barge-in: silence the agent immediately. */
  clear(): void {
    for (const src of this.playing) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    this.playing.clear();
    this.playhead = 0;
  }

  /** Seconds of agent audio still to play. */
  remaining(): number {
    return Math.max(0, this.playhead - this.ctx.currentTime);
  }

  isSpeaking(): boolean {
    return this.remaining() > 0.02;
  }

  /** Latest microphone RMS (0 while muted). */
  inputLevel(): number {
    return this.closed ? 0 : this.micRms;
  }

  /** RMS of the agent audio playing right now. */
  outputLevel(): number {
    if (this.closed || this.playing.size === 0) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (let i = 0; i < this.samples.length; i++) sum += this.samples[i] * this.samples[i];
    return Math.sqrt(sum / this.samples.length);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.clear();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.node?.disconnect();
    this.stream = null;
    if (this.ctx.state !== "closed") await this.ctx.close().catch(() => undefined);
  }
}
