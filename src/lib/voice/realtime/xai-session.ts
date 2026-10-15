import { EventEmitter } from "node:events";
import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Client for the xAI Grok Voice Agent API (speech-to-speech over WebSocket,
// OpenAI-Realtime-style events). One instance = one live voice session.
//
//   connect() → conversation.created → session.update → session.updated ("ready")
//   appendAudio() streams caller audio; "audio" events stream agent audio.
//   Function calls arrive as "function_call"; answer each with
//   sendFunctionResult() — the next response starts once every call of the
//   turn has an output (parallel calls get a single response.create).
// ---------------------------------------------------------------------------

export type AudioFormat =
  | { type: "audio/pcmu" }
  | { type: "audio/pcma" }
  | { type: "audio/pcm"; rate: number };

export interface RealtimeFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RealtimeSessionConfig {
  instructions: string;
  voice: string;
  input: AudioFormat;
  output: AudioFormat;
  tools?: RealtimeFunctionTool[];
  /** BCP-47 hint for the caller's language (e.g. "tr"); detection is automatic otherwise. */
  languageHint?: string;
  /** Names/terms the recogniser should favour (refs, districts, provider names). */
  keyterms?: string[];
  /** "none" for pure relays like interpretation; default lets the model reason. */
  reasoningEffort?: "high" | "none";
  /** Re-engage the caller after this much silence following a response. */
  idleTimeoutMs?: number;
}

export interface RealtimeSessionOptions {
  apiKey: string;
  model: string;
  url?: string;
  config: RealtimeSessionConfig;
  connectTimeoutMs?: number;
  log?: (msg: string, extra?: unknown) => void;
}

export interface FunctionCall {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  rawArguments: string;
}

export interface RealtimeSessionEvents {
  ready: [];
  audio: [base64: string];
  agent_transcript_delta: [text: string];
  agent_transcript_done: [text: string];
  user_transcript_delta: [text: string];
  user_transcript: [text: string];
  speech_started: [];
  speech_stopped: [];
  function_call: [call: FunctionCall];
  response_started: [];
  response_done: [];
  error: [error: Error];
  closed: [code: number];
}

const DEFAULT_URL = "wss://api.x.ai/v1/realtime";

/** The fields of server events this client reads. */
interface ServerEvent {
  type?: string;
  delta?: string;
  transcript?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  item?: { type?: string; call_id?: string; name?: string; arguments?: string };
  error?: { message?: string };
}

export class XaiRealtimeSession extends EventEmitter<RealtimeSessionEvents> {
  private ws: WebSocket | null = null;
  private ready = false;
  private closed = false;
  private seenCalls = new Set<string>();
  /** Function calls of the current turn still waiting for an output. */
  private pendingCalls = new Set<string>();
  private turnHadCalls = false;
  private responseInFlight = false;
  private agentText = "";

  constructor(private readonly opts: RealtimeSessionOptions) {
    super();
  }

  get isReady(): boolean {
    return this.ready && !this.closed;
  }

  /** Opens the socket and resolves once the session is configured. */
  connect(): Promise<void> {
    const url = `${this.opts.url ?? DEFAULT_URL}?model=${encodeURIComponent(this.opts.model)}`;
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${this.opts.apiKey}` } });
    this.ws = ws;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Voice model connection timed out"));
        ws.terminate();
      }, this.opts.connectTimeoutMs ?? 10_000);

      const fail = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };

      ws.on("message", (data) => {
        let msg: ServerEvent;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg.type === "session.updated" && !this.ready) {
          this.ready = true;
          clearTimeout(timer);
          resolve();
          this.emit("ready");
          return;
        }
        if (msg.type === "error" && !this.ready) {
          fail(new Error(msg.error?.message ?? "Voice model rejected the session"));
          return;
        }
        this.handle(msg);
      });
      ws.on("error", (err) => {
        if (!this.ready) fail(err);
        else this.emit("error", err);
      });
      ws.on("close", (code) => {
        if (!this.ready) fail(new Error(`Voice model closed the connection (${code})`));
        this.closed = true;
        this.ready = false;
        this.emit("closed", code);
      });
    });
  }

  private send(event: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(event));
  }

  private sessionUpdate(): Record<string, unknown> {
    const c = this.opts.config;
    const transcription: Record<string, unknown> = { model: "grok-transcribe" };
    if (c.languageHint) transcription.language_hint = c.languageHint;
    if (c.keyterms?.length) {
      transcription.keyterms = c.keyterms.filter(Boolean).slice(0, 100).map((k) => k.slice(0, 50));
    }
    return {
      type: "session.update",
      session: {
        instructions: c.instructions,
        voice: c.voice,
        turn_detection: {
          type: "server_vad",
          ...(c.idleTimeoutMs ? { idle_timeout_ms: c.idleTimeoutMs } : {}),
        },
        audio: {
          input: { format: c.input, transcription },
          output: { format: c.output },
        },
        ...(c.tools?.length ? { tools: c.tools } : {}),
        ...(c.reasoningEffort ? { reasoning: { effort: c.reasoningEffort } } : {}),
      },
    };
  }

  private handle(msg: ServerEvent): void {
    switch (msg.type) {
      case "conversation.created":
        this.send(this.sessionUpdate());
        break;
      case "response.created":
        this.responseInFlight = true;
        this.turnHadCalls = false;
        this.agentText = "";
        this.emit("response_started");
        break;
      case "response.output_audio.delta":
      case "response.audio.delta":
        if (msg.delta) this.emit("audio", msg.delta);
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        if (msg.delta) {
          this.agentText += msg.delta;
          this.emit("agent_transcript_delta", msg.delta);
        }
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const text = msg.transcript ?? this.agentText;
        this.agentText = "";
        if (text?.trim()) this.emit("agent_transcript_done", text.trim());
        break;
      }
      case "conversation.item.input_audio_transcription.updated":
      case "conversation.item.input_audio_transcription.delta":
        if (msg.delta || msg.transcript) this.emit("user_transcript_delta", (msg.delta ?? msg.transcript) as string);
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (msg.transcript?.trim()) this.emit("user_transcript", msg.transcript.trim());
        break;
      case "input_audio_buffer.speech_started":
        this.emit("speech_started");
        break;
      case "input_audio_buffer.speech_stopped":
        this.emit("speech_stopped");
        break;
      case "response.function_call_arguments.done":
        this.onFunctionCall(msg.call_id, msg.name, msg.arguments);
        break;
      case "response.output_item.done":
        if (msg.item?.type === "function_call") {
          this.onFunctionCall(msg.item.call_id, msg.item.name, msg.item.arguments);
        }
        break;
      case "response.done":
      case "response.cancelled":
        this.responseInFlight = false;
        this.emit("response_done");
        this.maybeContinue();
        break;
      case "error":
        this.emit("error", new Error(msg.error?.message ?? "Voice model error"));
        break;
      default:
        break;
    }
  }

  private onFunctionCall(callId: string | undefined, name: string | undefined, raw: string | undefined) {
    if (!callId || !name || this.seenCalls.has(callId)) return;
    this.seenCalls.add(callId);
    this.pendingCalls.add(callId);
    this.turnHadCalls = true;
    let args: Record<string, unknown> = {};
    try {
      args = raw ? JSON.parse(raw) : {};
    } catch {
      args = {};
    }
    this.emit("function_call", { callId, name, args, rawArguments: raw ?? "" });
  }

  /** Once the turn is over and every call has an output, let the agent continue. */
  private maybeContinue(): void {
    if (this.turnHadCalls && !this.responseInFlight && this.pendingCalls.size === 0) {
      this.turnHadCalls = false;
      this.send({ type: "response.create" });
    }
  }

  appendAudio(base64: string): void {
    if (this.ready) this.send({ type: "input_audio_buffer.append", audio: base64 });
  }

  /** Adds a user text message (typed input, or a bracketed cue) and asks for a reply. */
  sendText(text: string, { respond = true }: { respond?: boolean } = {}): void {
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    });
    if (respond) this.send({ type: "response.create" });
  }

  /** Asks the agent to speak now (greeting, outbound opener). */
  respond(): void {
    this.send({ type: "response.create" });
  }

  sendFunctionResult(callId: string, output: unknown): void {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: typeof output === "string" ? output : JSON.stringify(output),
      },
    });
    this.pendingCalls.delete(callId);
    this.maybeContinue();
  }

  close(): void {
    this.closed = true;
    this.ready = false;
    this.ws?.close();
  }
}
