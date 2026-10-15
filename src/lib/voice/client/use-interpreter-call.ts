"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicError, VoiceAudio } from "./audio-io";

export interface Caption {
  id: number;
  side: "manager" | "hospital";
  kind: "original" | "translation";
  text: string;
  /** Set on originals, which are updated while that side is still speaking. */
  line?: string;
}

export type BridgeStatus = "idle" | "dialing" | "ringing" | "connecting" | "connected" | "no_answer" | "ended" | "error";

let captionId = 0;

/** The case manager's side of an interpreted call (browser mic + speakers). */
export function useInterpreterCall() {
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<VoiceAudio | null>(null);

  const teardown = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState <= WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "hangup" }));
      } catch {
        // already closing
      }
      ws.close();
    }
    void audioRef.current?.close();
    audioRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(
    async (opts: { caseId: string; hospitalNumber: string; hospitalLanguage: string }) => {
      teardown();
      setError(null);
      setCaptions([]);
      setStatus("dialing");
      const audio = new VoiceAudio();
      audioRef.current = audio;
      try {
        await audio.startMic();
      } catch (err) {
        setError(err instanceof MicError ? err.message : "The microphone could not be started.");
        setStatus("error");
        void audio.close();
        return;
      }
      const res = await fetch("/api/calls/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      }).catch(() => null);
      const body = await res?.json().catch(() => null);
      if (!res || !res.ok) {
        setError(body?.error?.message ?? "The interpreted call could not be started.");
        setStatus("error");
        void audio.close();
        return;
      }
      setLanguages(body.languages ?? []);
      const ws = new WebSocket(body.url);
      wsRef.current = ws;
      audio.onChunk = (b64) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "audio", data: b64 }));
      ws.onmessage = (m) => {
        let e: { type: string; data?: string; mark?: string; status?: BridgeStatus; side?: Caption["side"]; kind?: Caption["kind"]; text?: string; line?: string; message?: string; languages?: string[] };
        try {
          e = JSON.parse(m.data as string);
        } catch {
          return;
        }
        if (e.type === "audio" && e.data) audio.play(e.data);
        else if (e.type === "clear") audio.clear();
        else if (e.type === "mark")
          window.setTimeout(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "played", mark: e.mark })), audio.remaining() * 1000);
        else if (e.type === "bridge_status" && e.status) {
          setStatus(e.status);
          if (e.languages) setLanguages(e.languages);
        } else if (e.type === "caption" && e.side && e.kind && e.text) {
          const { side, kind, text, line } = e;
          setCaptions((list) => {
            const idx = line ? list.findIndex((c) => c.line === line) : -1;
            if (idx >= 0) return list.map((c, i) => (i === idx ? { ...c, text } : c));
            return [...list, { id: ++captionId, side, kind, text, line }].slice(-60);
          });
        } else if (e.type === "error") {
          setError(e.message ?? "The interpreter failed.");
          setStatus("error");
        }
      };
      ws.onclose = () => {
        setStatus((s) => (s === "error" || s === "no_answer" ? s : "ended"));
        window.setTimeout(() => void audio.close(), audio.remaining() * 1000 + 300);
      };
    },
    [teardown]
  );

  const hangup = useCallback(() => {
    teardown();
    setStatus("ended");
  }, [teardown]);

  return { status, error, captions, languages, start, hangup };
}
