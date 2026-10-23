"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { MicError, VoiceAudio, type MicProblem } from "./audio-io";
import { nextUserSpeaking } from "./levels";

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
  /** Stable across running → done, so the UI can animate one step. */
  id: number;
  name: string;
  status: "running" | "done" | "error";
  summary?: string;
}

/** Something an agent's tool recorded, shown as it happens. */
export interface AgentResult {
  id: number;
  kind: string;
  title: string;
  detail?: string;
}

const money = (amount: unknown, currency: unknown) =>
  typeof amount === "number" ? `${amount.toLocaleString("en-GB", { maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}` : "";

/** Gateway events that record a result, in words for the results panel. */
export function resultOf(e: Record<string, unknown>): Omit<AgentResult, "id"> | null {
  switch (e.type) {
    case "coverage":
      return e.benefit ? { kind: "coverage", title: `${e.benefit}: ${e.covered ? "covered" : "not covered"}`, detail: e.plan ? `${e.plan} plan` : undefined } : null;
    case "guarantee_found": {
      const letters = (e.letters as { ref: string; status: string; amount: number; currency: string }[] | undefined) ?? [];
      return letters.length
        ? { kind: "guarantee", title: `Guarantee ${letters.map((l) => l.ref).join(", ")} found`, detail: letters.map((l) => `${money(l.amount, l.currency)}, ${l.status.toLowerCase()}`).join("; ") }
        : null;
    }
    case "guarantee_resent":
      return { kind: "guarantee", title: `${e.ref} re-sent by ${e.via === "EMAIL" ? "e-mail" : "fax"}`, detail: "To the hospital's number on file" };
    case "topup_requested":
      return { kind: "guarantee", title: `Top-up requested on ${e.ref}`, detail: `New estimate ${money(e.amount, e.currency)}: a case manager decides` };
    case "bill_agreement":
      return {
        kind: "money",
        title:
          e.outcome === "AGREED"
            ? `Hospital agreed ${money(e.amount, e.currency)}`
            : e.outcome === "COUNTER_OFFER"
              ? `Counter-offer ${money(e.amount, e.currency)}`.trim()
              : e.outcome === "REFUSED"
                ? "Hospital refused the reduction"
                : "Hospital will call back",
        detail: e.outcome === "AGREED" ? "Patient held harmless; corrected invoice to follow" : "A case manager follows up",
      };
    case "transport_plan":
      return { kind: "transport", title: `Transport plan ${e.ref}`, detail: String(e.label ?? "") };
    case "hospital_update":
      return { kind: "update", title: "Hospital update saved to the case" };
    case "upload_link":
      return { kind: "update", title: e.sent ? `Upload link texted for ${e.claim}` : `Upload link created for ${e.claim}` };
    default:
      return null;
  }
}

/** What /api/voice/session returned for a started session. */
export interface VoiceSessionInfo {
  url: string;
  call: { id: string; ref: string };
  /** Internal assistant: the conversation the session saves into. */
  thread?: { id: string };
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
  /** The caller has finished and the agent is working out its answer. */
  thinking: boolean;
  transcript: TranscriptLine[];
  partial: { user: string; agent: string };
  /** The id the agent's in-progress line will keep once it is final. */
  partialAgentId: number | null;
  tools: ToolActivity[];
  providers: { date: string; location: string; options: ProviderOption[] } | null;
  booking: Booking | null;
  caseRef: { id: string; ref: string } | null;
  handoff: { target: string; reason: string; summary: string } | null;
  /** What the agent recorded during the session (guarantee found, bill agreed, …). */
  results: AgentResult[];
  /** A page the agent asked to open on the operator's screen (internal assistant). */
  navigate: { id: number; href: string; label: string } | null;
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
  thinking: false,
  transcript: [],
  partial: { user: "", agent: "" },
  partialAgentId: null,
  tools: [],
  providers: null,
  booking: null,
  caseRef: null,
  handoff: null,
  results: [],
  navigate: null,
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
  href?: string;
  label?: string;
}

type Action =
  | { type: "start" }
  | { type: "error"; message: string; mic?: MicProblem; code?: string }
  | { type: "mic_unavailable"; message: string; mic: MicProblem }
  | { type: "event"; event: GatewayEvent }
  | { type: "muted"; muted: boolean }
  | { type: "speaking"; agent: boolean }
  | { type: "user_speaking"; speaking: boolean }
  | { type: "thinking"; on: boolean }
  | { type: "ended"; reason: string };

/** Agent audio or text has started arriving, so it is no longer thinking. */
const answered = (state: VoiceState): VoiceState => (state.thinking ? { ...state, thinking: false } : state);

let lineId = 0;
let toolId = 0;

/** Exported for tests. */
export const initialVoiceState = initial;

/** Exported for tests. */
export function voiceReducer(state: VoiceState, action: Action): VoiceState {
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
      if (state.agentSpeaking === action.agent) return state;
      return { ...state, agentSpeaking: action.agent, thinking: action.agent ? false : state.thinking };
    case "user_speaking":
      return state.userSpeaking === action.speaking ? state : { ...state, userSpeaking: action.speaking };
    case "thinking":
      return state.thinking === action.on || state.phase !== "live" ? state : { ...state, thinking: action.on };
    case "ended":
      return state.phase === "error"
        ? state
        : { ...state, phase: "ended", endReason: action.reason, agentSpeaking: false, thinking: false };
    case "event": {
      const e = action.event;
      switch (e.type) {
        case "ready":
          return { ...state, phase: "live", callRef: e.callRef ?? null, agentLabel: e.agent ?? null };
        case "agent_thinking":
          return state.phase === "live" && !state.agentSpeaking ? { ...state, thinking: true } : state;
        case "user_speaking":
          return answered(state);
        case "transcript_delta": {
          const role = e.role ?? "agent";
          const next = { ...state, partial: { ...state.partial, [role]: state.partial[role] + (e.text ?? "") } };
          if (role !== "agent") return next;
          return answered({ ...next, partialAgentId: state.partialAgentId ?? ++lineId });
        }
        case "transcript": {
          const role = e.role ?? "agent";
          const idx = e.line ? state.transcript.findIndex((t) => t.line === e.line) : -1;
          const transcript =
            idx >= 0
              ? state.transcript.map((t, i) => (i === idx ? { ...t, text: e.text ?? "" } : t))
              : [
                  ...state.transcript,
                  // An agent line keeps the id its in-progress caption had.
                  { id: (role === "agent" ? state.partialAgentId : null) ?? ++lineId, role, text: e.text ?? "", line: e.line },
                ];
          const next = { ...state, transcript, partial: { ...state.partial, [role]: "" } };
          return role === "agent" ? answered({ ...next, partialAgentId: null }) : next;
        }
        case "tool": {
          const tools = [...state.tools];
          const idx = tools.findLastIndex((t) => t.name === e.name && t.status === "running");
          const entry: ToolActivity = {
            id: idx >= 0 && e.status !== "running" ? tools[idx].id : ++toolId,
            name: e.name ?? "tool",
            status: e.status ?? "done",
            summary: e.summary,
          };
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
        case "navigate":
          // Only paths inside the app.
          return e.href?.startsWith("/") && !e.href.startsWith("//")
            ? { ...state, navigate: { id: ++toolId, href: e.href, label: e.label ?? e.href } }
            : state;
        case "handoff":
          return { ...state, handoff: { target: e.target ?? "", reason: e.reason ?? "", summary: e.summary ?? "" } };
        case "error":
          return { ...state, phase: "error", error: { message: e.message ?? "Something went wrong." } };
        case "coverage":
        case "guarantee_found":
        case "guarantee_resent":
        case "topup_requested":
        case "bill_agreement":
        case "transport_plan":
        case "hospital_update":
        case "upload_link": {
          const result = resultOf(e as unknown as Record<string, unknown>);
          return result ? { ...state, results: [...state.results, { id: ++toolId, ...result }].slice(-6) } : state;
        }
        case "ended":
          return { ...state, phase: "ended", endReason: e.reason ?? null, agentSpeaking: false, thinking: false };
        default:
          return state;
      }
    }
  }
}

export function useGrokVoice() {
  const [state, dispatch] = useReducer(voiceReducer, initial);
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
    async (opts: { profile?: string; caseId?: string; language?: string; threadId?: string; record?: string } = {}): Promise<VoiceSessionInfo | null> => {
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

      let session: VoiceSessionInfo;
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
          return null;
        }
        session = body;
      } catch {
        dispatch({ type: "error", message: "Could not reach the server. Check your connection and try again." });
        void audio.close();
        return null;
      }

      const ws = new WebSocket(session.url);
      wsRef.current = ws;
      audio.onChunk = (b64) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "audio", data: b64 }));
      };
      // Levels go straight to the visuals (see getLevels); React only hears
      // when the caller starts or stops talking, not 25 times a second.
      let speaking = false;
      audio.onLevel = (rms) => {
        const next = nextUserSpeaking(speaking, rms);
        if (next !== speaking) {
          speaking = next;
          dispatch({ type: "user_speaking", speaking: next });
        }
      };

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
      return session;
    },
    [teardown]
  );

  const stop = useCallback(() => {
    teardown();
    dispatch({ type: "ended", reason: "you ended the session" });
  }, [teardown]);

  const sendText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && text.trim()) {
      ws.send(JSON.stringify({ type: "text", text: text.trim() }));
      dispatch({ type: "thinking", on: true });
    }
  }, []);

  // Never leave the agent "thinking" if no answer event arrives.
  useEffect(() => {
    if (!state.thinking) return;
    const timer = window.setTimeout(() => dispatch({ type: "thinking", on: false }), 8000);
    return () => window.clearTimeout(timer);
  }, [state.thinking]);

  /** Raw RMS for the visuals, read every animation frame (no re-render). */
  const getLevels = useCallback(
    () => ({ mic: audioRef.current?.inputLevel() ?? 0, agent: audioRef.current?.outputLevel() ?? 0 }),
    []
  );

  const setMuted = useCallback((muted: boolean) => {
    audioRef.current?.setMuted(muted);
    dispatch({ type: "muted", muted });
  }, []);

  return { state, start, stop, sendText, setMuted, getLevels };
}
