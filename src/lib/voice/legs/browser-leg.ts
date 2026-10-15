import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import type { AudioFormat } from "../realtime/xai-session";
import type { VoiceLeg } from "./types";

// ---------------------------------------------------------------------------
// Browser leg: a tab streaming microphone PCM16 (24 kHz, base64) over the
// gateway WebSocket. JSON protocol —
//   browser → gateway: {type:"audio",data} | {type:"text",text} | {type:"played",mark} | {type:"hangup"}
//   gateway → browser: {type:"audio",data} | {type:"clear"} | {type:"mark",mark} | UI events
// ---------------------------------------------------------------------------

export const BROWSER_SAMPLE_RATE = 24_000;

export class BrowserLeg implements VoiceLeg {
  readonly kind = "browser" as const;
  readonly format: AudioFormat = { type: "audio/pcm", rate: BROWSER_SAMPLE_RATE };

  private audioHandlers: ((b64: string) => void)[] = [];
  private textHandlers: ((text: string) => void)[] = [];
  private closeHandlers: ((reason: string) => void)[] = [];
  private marks = new Map<string, () => void>();
  private closed = false;

  constructor(private readonly ws: WebSocket) {
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return;
      let msg: { type?: string; data?: string; text?: string; mark?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.type) {
        case "audio":
          if (typeof msg.data === "string") for (const h of this.audioHandlers) h(msg.data);
          break;
        case "text":
          if (typeof msg.text === "string" && msg.text.trim()) {
            const text = msg.text.trim().slice(0, 1000);
            for (const h of this.textHandlers) h(text);
          }
          break;
        case "played":
          if (msg.mark) {
            this.marks.get(msg.mark)?.();
            this.marks.delete(msg.mark);
          }
          break;
        case "hangup":
          this.close("caller hung up");
          break;
      }
    });
    ws.on("close", () => this.finish("browser disconnected"));
    ws.on("error", () => this.finish("browser connection error"));
  }

  private send(msg: Record<string, unknown>): void {
    if (!this.closed && this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
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
  onText(handler: (text: string) => void): void {
    this.textHandlers.push(handler);
  }
  onDtmf(): void {
    // Browsers have no keypad.
  }
  onClose(handler: (reason: string) => void): void {
    this.closeHandlers.push(handler);
  }

  sendAudio(base64: string): void {
    this.send({ type: "audio", data: base64 });
  }

  clearPlayback(): void {
    this.send({ type: "clear" });
    // Cleared audio will never be reported as played.
    for (const resolve of this.marks.values()) resolve();
    this.marks.clear();
  }

  awaitPlayback(timeoutMs = 15_000): Promise<void> {
    if (this.closed) return Promise.resolve();
    const mark = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.marks.delete(mark);
        resolve();
      }, timeoutMs);
      this.marks.set(mark, () => {
        clearTimeout(timer);
        resolve();
      });
      this.send({ type: "mark", mark });
    });
  }

  sendEvent(event: Record<string, unknown>): void {
    this.send(event);
  }

  close(reason: string): void {
    if (this.closed) return;
    this.send({ type: "ended", reason });
    this.finish(reason);
    setTimeout(() => this.ws.close(1000, "session ended"), 50);
  }
}
