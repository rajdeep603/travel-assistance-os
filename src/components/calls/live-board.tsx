"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Globe, Phone, PhoneIncoming, PhoneOutgoing, User, Wrench } from "lucide-react";
import { Card, EmptyState, SectionTitle, StatusBadge } from "@/components/ui";
import { Elapsed } from "@/components/elapsed";
import { maskPhone } from "@/lib/format";
import { toolChipLabel } from "@/lib/voice/tool-labels";
import { toolSteps } from "@/lib/voice/tool-steps";

/** How long a finished call stays on the board with its outcome. */
const ENDED_LINGER_MS = 10_000;

type Activity = "listening" | "hearing" | "thinking" | "speaking";

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

/** A call on the board: the gateway's view plus what is happening right now. */
interface BoardCall extends ActiveCall {
  /** The agent's sentence as it is being spoken. */
  partial: string;
  activity: Activity;
  ended: { status: string; durationSec: number | null; summary: string | null } | null;
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
  summary?: string | null;
  durationSec?: number;
  at?: string;
  case?: { ref?: string };
}

const ACTIVITY: Record<Activity, { label: string; dot: string }> = {
  listening: { label: "Listening", dot: "bg-stage-muted" },
  hearing: { label: "Caller speaking", dot: "bg-live" },
  thinking: { label: "Thinking", dot: "bg-ai" },
  speaking: { label: "Agent speaking", dot: "bg-brand-2" },
};

const onBoard = (c: ActiveCall): BoardCall => ({ ...c, partial: "", activity: "listening", ended: null });

/** Applies one monitor event to a call; returns null when nothing changed. */
function applyEvent(call: BoardCall, msg: MonitorMessage): BoardCall | null {
  const at = msg.at ?? new Date().toISOString();
  switch (msg.type) {
    case "user_speaking":
      return { ...call, activity: "hearing" };
    case "agent_thinking":
      return { ...call, activity: "thinking" };
    case "transcript_delta":
      return msg.role === "user" ? null : { ...call, partial: call.partial + (msg.text ?? ""), activity: "speaking" };
    case "transcript": {
      if (!msg.text) return null;
      const text = msg.text;
      // A caller utterance that grew replaces its earlier version.
      const idx = msg.line ? call.transcript.findIndex((t) => t.line === msg.line) : -1;
      const transcript =
        idx >= 0
          ? call.transcript.map((t, i) => (i === idx ? { ...t, text } : t))
          : [...call.transcript, { role: msg.role ?? "agent", text, at, line: msg.line }].slice(-30);
      return msg.role === "user" ? { ...call, transcript } : { ...call, transcript, partial: "", activity: "listening" };
    }
    case "tool": {
      if (!msg.name) return null;
      const entry = { name: msg.name, status: msg.status ?? "done", summary: msg.summary ?? undefined, at };
      const idx = entry.status === "running" ? -1 : call.tools.findLastIndex((t) => t.name === entry.name && t.status === "running");
      const tools = idx >= 0 ? call.tools.map((t, i) => (i === idx ? entry : t)) : [...call.tools, entry].slice(-20);
      return { ...call, tools };
    }
    case "case":
    case "booked":
      return msg.case?.ref ? { ...call, caseRef: msg.case.ref } : null;
    default:
      return null;
  }
}

/** Live view of every active AI call, streamed from the voice gateway. */
export function LiveBoard({ monitorUrl, onCallEnded }: { monitorUrl: string | null; onCallEnded?: () => void }) {
  const [calls, setCalls] = useState<Map<string, BoardCall>>(new Map());
  const [connected, setConnected] = useState(false);
  const endedRef = useRef(onCallEnded);
  endedRef.current = onCallEnded;

  useEffect(() => {
    if (!monitorUrl) return;
    let ws: WebSocket | null = null;
    let retry: number | null = null;
    let stopped = false;
    const lingering = new Set<number>();

    const remove = (callId: string) =>
      setCalls((prev) => {
        if (!prev.has(callId)) return prev;
        const next = new Map(prev);
        next.delete(callId);
        return next;
      });

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
        if (msg.type === "call_ended" && msg.callId) {
          // Keep the card for a moment with its outcome, then let it go.
          const callId = msg.callId;
          const timer = window.setTimeout(() => {
            lingering.delete(timer);
            remove(callId);
          }, ENDED_LINGER_MS);
          lingering.add(timer);
          endedRef.current?.();
        }
        setCalls((prev) => {
          if (msg.type === "snapshot" && msg.calls) {
            const next = new Map<string, BoardCall>();
            // Finished calls still lingering stay until their timer clears them.
            for (const [id, c] of prev) if (c.ended) next.set(id, c);
            for (const c of msg.calls) next.set(c.callId, onBoard(c));
            return next;
          }
          if (!msg.callId) return prev;
          if (msg.type === "call_started" && msg.call) return new Map(prev).set(msg.callId, onBoard(msg.call));
          const call = prev.get(msg.callId);
          if (!call) return prev;
          if (msg.type === "call_ended") {
            const ended = { status: msg.status ?? "COMPLETED", durationSec: msg.durationSec ?? null, summary: msg.summary ?? null };
            return new Map(prev).set(msg.callId, { ...call, partial: "", ended });
          }
          const updated = applyEvent(call, msg);
          return updated ? new Map(prev).set(msg.callId, updated) : prev;
        });
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retry) window.clearTimeout(retry);
      for (const timer of lingering) window.clearTimeout(timer);
      ws?.close();
    };
  }, [monitorUrl]);

  const board = [...calls.values()];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionTitle>Live calls</SectionTitle>
        <span className={`flex items-center gap-2 text-xs font-medium ${connected ? "text-emerald-700" : "text-slate-400"}`}>
          <span className="relative flex h-2 w-2" aria-hidden>
            {connected ? <span className="animate-live-ping absolute inset-0 rounded-full bg-emerald-500" /> : null}
            <span className={`relative h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`} />
          </span>
          {connected ? "Live" : monitorUrl ? "Connecting…" : "Unavailable"}
        </span>
      </div>
      {board.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No calls right now" hint="Calls to the hotline and web voice sessions appear here as they happen." />
        </div>
      ) : (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <AnimatePresence initial={false}>
            {board.map((c) => (
              <motion.div
                key={c.callId}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: c.ended ? 0.82 : 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <LiveCallCard call={c} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Card>
  );
}

function LiveCallCard({ call: c }: { call: BoardCall }) {
  const activity = ACTIVITY[c.activity];
  const running = c.tools.some((t) => t.status === "running");
  const chips = toolSteps(c.tools.map((t, i) => ({ ...t, id: i }))).slice(-4);

  return (
    <div className="rounded-2xl bg-stage p-4 text-stage-ink ring-1 ring-stage-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {c.channel === "PHONE" ? (
            c.direction === "outbound" ? (
              <PhoneOutgoing size={15} className="text-live" aria-hidden />
            ) : (
              <PhoneIncoming size={15} className="text-live" aria-hidden />
            )
          ) : (
            <Globe size={15} className="text-live" aria-hidden />
          )}
          <Link href={`/calls/${c.callId}`} className="hover:underline">
            {c.callRef}
          </Link>
          <span className="font-normal text-stage-muted">· {c.profileLabel}</span>
        </p>
        <span className="flex items-center gap-2 text-xs text-stage-muted">
          {c.caller ? (
            <span className="flex items-center gap-1">
              <Phone size={11} aria-hidden /> {maskPhone(c.caller)}
            </span>
          ) : null}
          {c.ended ? null : <Elapsed since={c.startedAt} />}
        </span>
      </div>

      {c.ended ? (
        <div className="mt-2">
          <p className="flex items-center gap-2 text-xs text-stage-muted">
            <StatusBadge value={c.ended.status} />
            Call ended
            {c.ended.durationSec != null
              ? ` after ${Math.floor(c.ended.durationSec / 60)}:${String(c.ended.durationSec % 60).padStart(2, "0")}`
              : ""}
            {c.caseRef ? <span className="font-medium text-brand-2">· Case {c.caseRef}</span> : null}
          </p>
          {c.ended.summary ? <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-stage-ink/90">{c.ended.summary}</p> : null}
        </div>
      ) : (
        <>
          <p className="mt-1.5 flex items-center gap-2 text-xs font-medium text-stage-muted">
            <span className="relative flex h-2 w-2" aria-hidden>
              {c.activity !== "listening" ? <span className={`animate-live-ping absolute inset-0 rounded-full ${activity.dot}`} /> : null}
              <span className={`relative h-2 w-2 rounded-full ${activity.dot}`} />
            </span>
            {running ? "Working" : activity.label}
            {c.caseRef ? <span className="text-brand-2">· Case {c.caseRef}</span> : null}
          </p>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs" aria-live="polite">
            {c.transcript.slice(-6).map((t, i) => (
              <p key={i} className="flex items-start gap-1.5 text-stage-ink/85">
                {t.role === "agent" ? (
                  <Bot size={12} className="mt-0.5 shrink-0 text-brand-2" aria-hidden />
                ) : (
                  <User size={12} className="mt-0.5 shrink-0 text-live" aria-hidden />
                )}
                <span>{t.text}</span>
              </p>
            ))}
            {c.partial ? (
              <p className="flex items-start gap-1.5 text-stage-ink">
                <Bot size={12} className="mt-0.5 shrink-0 text-brand-2" aria-hidden />
                <span>
                  {c.partial}
                  <span className="animate-caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] bg-brand-2" aria-hidden />
                </span>
              </p>
            ) : null}
          </div>
        </>
      )}

      {chips.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {chips.map((t) => (
            <span
              key={t.id}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ${
                t.status === "error"
                  ? "bg-amber-400/10 text-amber-300 ring-amber-400/30"
                  : t.status === "running"
                    ? "bg-brand-2/15 text-brand-2 ring-brand-2/40"
                    : "bg-stage-raised text-stage-muted ring-stage-line"
              }`}
            >
              <Wrench size={10} aria-hidden /> {toolChipLabel(t.name)}
              {t.status === "running" ? "…" : ""}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
