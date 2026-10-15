"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bot, Globe, Phone, PhoneIncoming, PhoneOutgoing, Radio, User, Wrench } from "lucide-react";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { maskPhone } from "@/lib/format";
import { toolChipLabel } from "@/lib/voice/tool-labels";

interface ActiveCall {
  callId: string;
  callRef: string;
  profileLabel: string;
  channel: "PHONE" | "BROWSER";
  direction: "inbound" | "outbound";
  startedAt: string;
  caller: string | null;
  caseRef: string | null;
  transcript: { role: "user" | "agent"; text: string; at: string; line?: string }[];
  tools: { name: string; status: string; summary?: string; at: string }[];
}

/** Gateway monitor events (see src/lib/voice/monitor.ts). */
interface MonitorMessage {
  type: string;
  callId?: string;
  calls?: ActiveCall[];
  call?: ActiveCall;
  role?: "user" | "agent";
  text?: string;
  line?: string;
  name?: string;
  status?: string;
  summary?: string;
  at?: string;
  case?: { ref?: string };
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return (
    <span className="tabular-nums">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

/** Live view of every active AI call, streamed from the voice gateway. */
export function LiveBoard({ monitorUrl, onCallEnded }: { monitorUrl: string | null; onCallEnded?: () => void }) {
  const [calls, setCalls] = useState<Map<string, ActiveCall>>(new Map());
  const [connected, setConnected] = useState(false);
  const endedRef = useRef(onCallEnded);
  endedRef.current = onCallEnded;

  useEffect(() => {
    if (!monitorUrl) return;
    let ws: WebSocket | null = null;
    let retry: number | null = null;
    let stopped = false;

    const connect = () => {
      ws = new WebSocket(monitorUrl);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) retry = window.setTimeout(connect, 3000);
      };
      ws.onmessage = (m) => {
        let msg: MonitorMessage;
        try {
          msg = JSON.parse(m.data as string);
        } catch {
          return;
        }
        setCalls((prev) => {
          const next = new Map(prev);
          if (msg.type === "snapshot" && msg.calls) {
            next.clear();
            for (const c of msg.calls) next.set(c.callId, c);
            return next;
          }
          if (!msg.callId) return prev;
          if (msg.type === "call_started" && msg.call) {
            next.set(msg.callId, msg.call);
            return next;
          }
          if (msg.type === "call_ended") {
            next.delete(msg.callId);
            endedRef.current?.();
            return next;
          }
          const call = next.get(msg.callId);
          if (!call) return prev;
          const copy = { ...call };
          const at = msg.at ?? new Date().toISOString();
          if (msg.type === "transcript" && msg.text) {
            const text = msg.text;
            // A caller utterance that grew replaces its earlier version.
            const idx = msg.line ? call.transcript.findIndex((t) => t.line === msg.line) : -1;
            copy.transcript =
              idx >= 0
                ? call.transcript.map((t, i) => (i === idx ? { ...t, text } : t))
                : [...call.transcript, { role: msg.role ?? "agent", text, at, line: msg.line }].slice(-30);
          } else if (msg.type === "tool" && msg.name) {
            const entry = { name: msg.name, status: msg.status ?? "done", summary: msg.summary, at };
            const idx = entry.status === "running" ? -1 : call.tools.findLastIndex((t) => t.name === entry.name && t.status === "running");
            copy.tools = idx >= 0 ? call.tools.map((t, i) => (i === idx ? entry : t)) : [...call.tools, entry].slice(-20);
          } else if ((msg.type === "case" || msg.type === "booked") && msg.case?.ref) {
            copy.caseRef = msg.case.ref;
          } else {
            return prev;
          }
          next.set(msg.callId, copy);
          return next;
        });
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retry) window.clearTimeout(retry);
      ws?.close();
    };
  }, [monitorUrl]);

  const active = [...calls.values()];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionTitle>Live calls</SectionTitle>
        <span className={`flex items-center gap-1.5 text-xs ${connected ? "text-emerald-600" : "text-slate-400"}`}>
          <Radio size={13} aria-hidden className={connected ? "motion-safe:animate-pulse" : ""} />
          {connected ? "Live" : monitorUrl ? "Connecting…" : "Unavailable"}
        </span>
      </div>
      {active.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No calls right now" hint="Calls to the hotline and web voice sessions appear here as they happen." />
        </div>
      ) : (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {active.map((c) => (
            <div key={c.callId} className="animate-fade-up rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {c.channel === "PHONE" ? (
                    c.direction === "outbound" ? <PhoneOutgoing size={15} className="text-emerald-600" aria-hidden /> : <PhoneIncoming size={15} className="text-emerald-600" aria-hidden />
                  ) : (
                    <Globe size={15} className="text-emerald-600" aria-hidden />
                  )}
                  <Link href={`/calls/${c.callId}`} className="hover:underline">
                    {c.callRef}
                  </Link>
                  <span className="font-normal text-slate-500">· {c.profileLabel}</span>
                </p>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {c.caller ? (
                    <span className="flex items-center gap-1">
                      <Phone size={11} aria-hidden /> {maskPhone(c.caller)}
                    </span>
                  ) : null}
                  <Elapsed since={c.startedAt} />
                </span>
              </div>
              {c.caseRef ? <p className="mt-1 text-xs font-medium text-blue-700">Case {c.caseRef}</p> : null}
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs" aria-live="polite">
                {c.transcript.slice(-6).map((t, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-slate-700">
                    {t.role === "agent" ? <Bot size={12} className="mt-0.5 shrink-0 text-blue-500" aria-hidden /> : <User size={12} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />}
                    <span>{t.text}</span>
                  </p>
                ))}
              </div>
              {c.tools.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.tools.slice(-4).map((t, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                        t.status === "error" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      <Wrench size={10} aria-hidden /> {toolChipLabel(t.name)}
                      {t.status === "running" ? "…" : ""}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
