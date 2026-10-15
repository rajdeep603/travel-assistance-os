"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { MicError, VoiceAudio, type MicProblem } from "./audio-io";

// ---------------------------------------------------------------------------
// React state machine for a browser voice session through the voice gateway:
//   idle → starting → live → ended   (or → error at any point)
// Audio, transcripts, tool activity and booking results all arrive as gateway
// events and are reduced into one state object the page renders.
// ---------------------------------------------------------------------------

export interface TranscriptLine {
  id: number;
  role: "user" | "agent";
  text: string;
  /** Set on caller utterances, which are updated as they grow. */
  line?: string;
}

export interface ProviderOption {
  option: number;
  provider_id: string;
  doctor: string;
  facility: string;
  specialty: string;
  district: string;
  distance_km: number | null;
  languages: string[];
  slots: string[];
  date: string;
}

export interface Booking {
  appointment: {
    ref: string;
    date: string;
    time: string;
    doctor: string;
    facility: string;
    district: string;
    address: string;
    phone: string;
    specialty: string;
  };
  case: { id: string; ref: string };
  patient: { ref: string; name: string };
}

export interface ToolActivity {
  name: string;
  status: "running" | "done" | "error";
  summary?: string;
}

export interface VoiceState {
  phase: "idle" | "starting" | "live" | "ended" | "error";
  callRef: string | null;
  agentLabel: string | null;
  error: { message: string; mic?: MicProblem; code?: string } | null;
  /** Mic unavailable but the session runs on typed input. */
  textOnly: boolean;
  muted: boolean;
  agentSpeaking: boolean;
  userSpeaking: boolean;
  level: number;
  transcript: TranscriptLine[];
  partial: { user: string; agent: string };
  tools: ToolActivity[];
  providers: { date: string; location: string; options: ProviderOption[] } | null;
  booking: Booking | null;
  caseRef: { id: string; ref: string } | null;
  handoff: { target: string; reason: string; summary: string } | null;
  endReason: string | null;
}

const initial: VoiceState = {
  phase: "idle",
  callRef: null,
  agentLabel: null,
  error: null,
  textOnly: false,
  muted: false,
  agentSpeaking: false,
  userSpeaking: false,
  level: 0,
  transcript: [],
  partial: { user: "", agent: "" },
  tools: [],
  providers: null,
  booking: null,
  caseRef: null,
  handoff: null,
  endReason: null,
};

/** Events from the voice gateway (see src/lib/voice/bridge.ts). */
interface GatewayEvent {
  type: string;
  role?: "user" | "agent";
  text?: string;
  line?: string;
  name?: string;
  status?: ToolActivity["status"];
  summary?: string;
  date?: string;
  location?: string;
  options?: ProviderOption[];
  case?: { id: string; ref: string };
  target?: string;
  reason?: string;
  message?: string;
  callRef?: string;
  agent?: string;
  data?: string;
  mark?: string;
}

type Action =
  | { type: "start" }
  | { type: "error"; message: string; mic?: MicProblem; code?: string }
  | { type: "mic_unavailable"; message: string; mic: MicProblem }
  | { type: "event"; event: GatewayEvent }
  | { type: "muted"; muted: boolean }
  | { type: "speaking"; agent: boolean }
  | { type: "level"; level: number }
  | { type: "ended"; reason: string };

let lineId = 0;

function reducer(state: VoiceState, action: Action): VoiceState {
  switch (action.type) {
    case "start":
      return { ...initial, phase: "starting" };
    case "error":
      return { ...state, phase: "error", error: { message: action.message, mic: action.mic, code: action.code } };
    case "mic_unavailable":
      return { ...state, textOnly: true, error: { message: action.message, mic: action.mic } };
    case "muted":
      return { ...state, muted: action.muted };
    case "speaking":
      return state.agentSpeaking === action.agent ? state : { ...state, agentSpeaking: action.agent };
    case "level":
      return { ...state, level: action.level, userSpeaking: action.level > 0.04 ? true : state.userSpeaking && action.level > 0.015 };
    case "ended":
      return state.phase === "error" ? state : { ...state, phase: "ended", endReason: action.reason, agentSpeaking: false };
    case "event": {
      const e = action.event;
      switch (e.type) {
        case "ready":
          return { ...state, phase: "live", callRef: e.callRef ?? null, agentLabel: e.agent ?? null };
        case "transcript_delta": {
          const role = e.role ?? "agent";
          return { ...state, partial: { ...state.partial, [role]: state.partial[role] + (e.text ?? "") } };
        }
        case "transcript": {
          const role = e.role ?? "agent";
          const idx = e.line ? state.transcript.findIndex((t) => t.line === e.line) : -1;
          const transcript =
            idx >= 0
              ? state.transcript.map((t, i) => (i === idx ? { ...t, text: e.text ?? "" } : t))
              : [...state.transcript, { id: ++lineId, role, text: e.text ?? "", line: e.line }];
          return { ...state, transcript, partial: { ...state.partial, [role]: "" } };
        }
        case "tool": {
          const tools = [...state.tools];
          const idx = tools.findLastIndex((t) => t.name === e.name && t.status === "running");
          const entry: ToolActivity = { name: e.name ?? "tool", status: e.status ?? "done", summary: e.summary };
          if (idx >= 0 && e.status !== "running") tools[idx] = entry;
          else tools.push(entry);
          return { ...state, tools: tools.slice(-8) };
        }
        case "providers":
          return { ...state, providers: { date: e.date ?? "", location: e.location ?? "", options: e.options ?? [] } };
        case "booked":
          return { ...state, booking: e as unknown as Booking, caseRef: e.case ?? state.caseRef };
        case "case":
          return { ...state, caseRef: e.case ?? state.caseRef };
        case "handoff":
          return { ...state, handoff: { target: e.target ?? "", reason: e.reason ?? "", summary: e.summary ?? "" } };
        case "error":
          return { ...state, phase: "error", error: { message: e.message ?? "Something went wrong." } };
        case "ended":
          return { ...state, phase: "ended", endReason: e.reason ?? null, agentSpeaking: false };
        default:
          return state;
      }
    }
  }
}

export function useGrokVoice() {
  const [state, dispatch] = useReducer(reducer, initial);
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<VoiceAudio | null>(null);
  const tickRef = useRef<number | null>(null);

  const teardown = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState <= WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "hangup" }));
      } catch {
        // socket already closing
      }
      ws.close();
    }
    void audioRef.current?.close();
    audioRef.current = null;
  }, []);

  // Leaving the page always releases the microphone and ends the session.
  useEffect(() => teardown, [teardown]);

  const start = useCallback(
    async (opts: { profile?: string; caseId?: string } = {}) => {
      teardown();
      dispatch({ type: "start" });
      // Created synchronously in the click handler so audio output is allowed.
      const audio = new VoiceAudio();
      audioRef.current = audio;

      // Ask for the microphone and start the session in parallel: a pending
      // permission prompt must not hold up the agent's greeting.
      const micReady = audio.startMic().then(
        () => true,
        (err: unknown) => {
          const mic = err instanceof MicError ? err : null;
          dispatch({
            type: "mic_unavailable",
            message: mic?.message ?? "The microphone could not be started.",
            mic: mic?.problem ?? "unsupported",
          });
          return false;
        }
      );

      let session: { url: string; call: { ref: string } };
      try {
        const res = await fetch("/api/voice/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(opts),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          dispatch({
            type: "error",
            message: body?.error?.message ?? "The voice session could not be started.",
            code: body?.error?.code,
          });
          void audio.close();
          return;
        }
        session = body;
      } catch {
        dispatch({ type: "error", message: "Could not reach the server. Check your connection and try again." });
        void audio.close();
        return;
      }

      const ws = new WebSocket(session.url);
      wsRef.current = ws;
      audio.onChunk = (b64) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "audio", data: b64 }));
      };
      audio.onLevel = (level) => dispatch({ type: "level", level });

      ws.onmessage = (msg) => {
        let event: GatewayEvent;
        try {
          event = JSON.parse(msg.data as string);
        } catch {
          return;
        }
        switch (event.type) {
          case "audio":
            if (event.data) audio.play(event.data);
            return;
          case "clear":
            audio.clear();
            return;
          case "mark":
            // Report when everything queued so far has actually been heard.
            window.setTimeout(
              () => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "played", mark: event.mark })),
              audio.remaining() * 1000
            );
            return;
          default:
            dispatch({ type: "event", event });
        }
      };
      ws.onerror = () => {
        dispatch({ type: "error", message: "The voice connection failed. Please try again." });
      };
      ws.onclose = (ev) => {
        dispatch({ type: "ended", reason: ev.reason || "session ended" });
        if (tickRef.current) window.clearInterval(tickRef.current);
        tickRef.current = null;
        // Let the agent's last words finish, then release the mic.
        window.setTimeout(() => {
          if (audioRef.current === audio) {
            void audio.close();
            audioRef.current = null;
          }
        }, audio.remaining() * 1000 + 300);
      };

      tickRef.current = window.setInterval(() => dispatch({ type: "speaking", agent: audio.isSpeaking() }), 120);
      void micReady;
    },
    [teardown]
  );

  const stop = useCallback(() => {
    teardown();
    dispatch({ type: "ended", reason: "you ended the session" });
  }, [teardown]);

  const sendText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && text.trim()) ws.send(JSON.stringify({ type: "text", text: text.trim() }));
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    audioRef.current?.setMuted(muted);
    dispatch({ type: "muted", muted });
  }, []);

  return { state, start, stop, sendText, setMuted };
}
