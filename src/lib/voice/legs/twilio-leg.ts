import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import type { AudioFormat } from "../realtime/xai-session";
import type { VoiceLeg } from "./types";

// ---------------------------------------------------------------------------
// Twilio leg: a bidirectional Media Stream (<Connect><Stream>) carrying G.711
// μ-law 8 kHz audio as base64 — the exact format the voice model is told to
// use, so audio is relayed untouched. Barge-in sends Twilio a "clear";
// playback completion is tracked with "mark" round-trips.
// ---------------------------------------------------------------------------

export interface TwilioStartInfo {
  streamSid: string;
  callSid: string;
  accountSid: string;
  customParameters: Record<string, string>;
}

type TwilioMessage =
  | { event: "connected" }
  | {
      event: "start";
      start: {
        streamSid: string;
        callSid: string;
        accountSid: string;
        customParameters?: Record<string, string>;
      };
    }
  | { event: "media"; media: { track?: string; payload: string } }
  | { event: "mark"; mark: { name: string } }
  | { event: "dtmf"; dtmf: { digit: string } }
  | { event: "stop" };

export class TwilioLeg implements VoiceLeg {
  readonly kind = "twilio" as const;
  readonly format: AudioFormat = { type: "audio/pcmu" };

  private streamSid: string | null = null;
  private audioHandlers: ((b64: string) => void)[] = [];
  private dtmfHandlers: ((digit: string) => void)[] = [];
  private closeHandlers: ((reason: string) => void)[] = [];
  private marks = new Map<string, () => void>();
  private closed = false;
  readonly started: Promise<TwilioStartInfo>;

  constructor(private readonly ws: WebSocket) {
    let onStart!: (info: TwilioStartInfo) => void;
    let onAbort!: (err: Error) => void;
    this.started = new Promise((resolve, reject) => {
      onStart = resolve;
      onAbort = reject;
    });
    // Callers attach handlers after awaiting `started`; keep the rejection quiet.
    this.started.catch(() => undefined);

    ws.on("message", (raw) => {
      let msg: TwilioMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.event) {
        case "start":
          this.streamSid = msg.start.streamSid;
          onStart({
            streamSid: msg.start.streamSid,
            callSid: msg.start.callSid,
            accountSid: msg.start.accountSid,
            customParameters: msg.start.customParameters ?? {},
          });
          break;
        case "media":
          if (msg.media.track === undefined || msg.media.track === "inbound") {
            for (const h of this.audioHandlers) h(msg.media.payload);
          }
          break;
        case "mark":
          this.marks.get(msg.mark.name)?.();
          this.marks.delete(msg.mark.name);
          break;
        case "dtmf":
          for (const h of this.dtmfHandlers) h(msg.dtmf.digit);
          break;
        case "stop":
          this.finish("call ended");
          break;
      }
    });
    ws.on("close", () => {
      onAbort(new Error("Media stream closed before it started"));
      this.finish("media stream closed");
    });
    ws.on("error", () => this.finish("media stream error"));
  }

  private send(msg: Record<string, unknown>): void {
    if (!this.closed && this.streamSid && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, streamSid: this.streamSid }));
    }
  }

  private finish(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const resolve of this.marks.values()) resolve();
    this.marks.clear();
    for (const h of this.closeHandlers) h(reason);
  }

  onAudio(handler: (b64: string) => void): void {
    this.audioHandlers.push(handler);
  }
  onText(): void {
    // Phone callers can't type.
  }
  onDtmf(handler: (digit: string) => void): void {
    this.dtmfHandlers.push(handler);
  }
  onClose(handler: (reason: string) => void): void {
    this.closeHandlers.push(handler);
  }

  sendAudio(base64: string): void {
    this.send({ event: "media", media: { payload: base64 } });
  }

  clearPlayback(): void {
    this.send({ event: "clear" });
    for (const resolve of this.marks.values()) resolve();
    this.marks.clear();
  }

  awaitPlayback(timeoutMs = 15_000): Promise<void> {
    if (this.closed || !this.streamSid) return Promise.resolve();
    const name = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.marks.delete(name);
        resolve();
      }, timeoutMs);
      this.marks.set(name, () => {
        clearTimeout(timer);
        resolve();
      });
      this.send({ event: "mark", mark: { name } });
    });
  }

  sendEvent(): void {
    // Nothing to render on a phone.
  }

  close(reason: string): void {
    this.finish(reason);
    this.ws.close(1000, "session ended");
  }
}
