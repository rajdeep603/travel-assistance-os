import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// In-process bus for the live Call Center view. The gateway publishes every
// session event here; /ws/monitor subscribers receive a snapshot of active
// calls on connect, then the live stream. Durable history lives in the DB.
// ---------------------------------------------------------------------------

export interface MonitorEvent {
  callId: string;
  callRef: string;
  type: string;
  at: string;
  [key: string]: unknown;
}

export interface ActiveCall {
  callId: string;
  callRef: string;
  profileId: string;
  profileLabel: string;
  channel: "PHONE" | "BROWSER";
  direction: "inbound" | "outbound";
  startedAt: string;
  caller: string | null;
  caseRef: string | null;
  /** `line` identifies a caller utterance that is updated as it grows. */
  transcript: { role: "user" | "agent"; text: string; at: string; line?: string }[];
  tools: { name: string; status: string; summary?: string; at: string }[];
}

const TRANSCRIPT_TAIL = 30;

class MonitorBus {
  private emitter = new EventEmitter();
  private active = new Map<string, ActiveCall>();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  started(call: ActiveCall): void {
    this.active.set(call.callId, call);
    this.publish({ callId: call.callId, callRef: call.callRef, type: "call_started", call });
  }

  publish(event: Omit<MonitorEvent, "at"> & { at?: string }): void {
    const full = { ...event, at: event.at ?? new Date().toISOString() } as MonitorEvent;
    const call = this.active.get(full.callId);
    if (call) {
      if (full.type === "transcript" && typeof full.text === "string") {
        const line = typeof full.line === "string" ? full.line : undefined;
        const existing = line ? call.transcript.find((t) => t.line === line) : undefined;
        if (existing) existing.text = full.text;
        else {
          call.transcript.push({ role: full.role as "user" | "agent", text: full.text, at: full.at, line });
          if (call.transcript.length > TRANSCRIPT_TAIL) call.transcript.shift();
        }
      }
      if (full.type === "tool") {
        const entry = { name: String(full.name), status: String(full.status), summary: full.summary as string | undefined, at: full.at };
        // A finished tool replaces its own "running" entry.
        const idx = full.status === "running" ? -1 : call.tools.findLastIndex((t) => t.name === entry.name && t.status === "running");
        if (idx >= 0) call.tools[idx] = entry;
        else call.tools.push(entry);
        if (call.tools.length > 20) call.tools.shift();
      }
      if (full.type === "case" || full.type === "booked") {
        const kase = full.case as { ref?: string } | undefined;
        if (kase?.ref) call.caseRef = kase.ref;
      }
    }
    if (full.type === "call_ended") this.active.delete(full.callId);
    this.emitter.emit("event", full);
  }

  snapshot(): ActiveCall[] {
    return [...this.active.values()];
  }

  subscribe(listener: (e: MonitorEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}

export const monitorBus = new MonitorBus();
