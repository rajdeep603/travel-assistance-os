"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import { BookOpenText, ExternalLink, FileText, Mic, MicOff, PhoneOff, SendHorizonal, Sparkles, SquarePen, Trash2 } from "lucide-react";
import { AISourceBadge } from "@/components/ui";
import { VoiceOrb, type OrbState } from "@/components/voice/voice-orb";
import { formatDate, formatTime } from "@/lib/format";
import { useWordReveal } from "@/lib/client/use-word-reveal";
import type { AssistantMessageDto } from "@/lib/services/assistant-history";
import type { VoiceState } from "@/lib/voice/client/use-grok-voice";
import { toolActivityLabel } from "@/lib/voice/tool-labels";
import { NEW_TITLE, useAssistant } from "./assistant-provider";

// ---------------------------------------------------------------------------
// The assistant conversation, shared by the floating panel and the page:
// messages (typed and spoken), the voice bar while voice mode is on, the
// composer, and the list of earlier conversations.
// ---------------------------------------------------------------------------

export const SUGGESTED = [
  "What documents are required for a hospitalization case?",
  "What is the status of CASE-1024?",
  "What is the process for arranging hospital admission?",
  "Which providers are available in Istanbul?",
  "When does a claim need to be escalated?",
];

const clock = (iso: string) => formatTime(iso);

function orbState(s: VoiceState): OrbState {
  if (s.phase === "starting") return "connecting";
  if (s.phase !== "live") return "idle";
  if (s.agentSpeaking) return "speaking";
  if (s.tools.some((t) => t.status === "running")) return "tool";
  if (s.thinking) return "thinking";
  if (s.muted || s.textOnly) return "muted";
  return s.userSpeaking ? "hearing" : "listening";
}

function voiceStatus(s: VoiceState): string {
  if (s.phase === "starting") return "Connecting…";
  const running = s.tools.findLast((t) => t.status === "running");
  if (s.agentSpeaking) return "Speaking…";
  if (running) return `${toolActivityLabel(running.name)}…`;
  if (s.thinking) return "Thinking…";
  if (s.muted) return "Muted";
  if (s.textOnly) return "Microphone off: type instead";
  return s.userSpeaking ? "Hearing you…" : "Listening";
}

/** "Thinking" dots while a typed question is answered. */
function TypingIndicator() {
  return (
    <div className="flex justify-start" role="status" aria-label="The assistant is thinking">
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3">
        <Sparkles size={14} className="text-ai" aria-hidden />
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
        </span>
      </div>
    </div>
  );
}

/** An assistant answer: written out word by word when it just arrived, then its sources. */
function AnswerBubble({ message, fresh, onGrow }: { message: AssistantMessageDto; fresh: boolean; onGrow: () => void }) {
  const { shown, done } = useWordReveal(message.text, fresh);
  useEffect(onGrow, [shown, onGrow]);
  return (
    <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2.5">
      <div className="prose-chat break-words text-sm leading-relaxed text-ink">
        <Markdown>{shown}</Markdown>
      </div>
      {done && message.sources.length ? (
        <div className="animate-fade-in mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2">
          <AISourceBadge source={message.aiSource} />
          <span className="text-[11px] font-medium text-slate-500">Sources</span>
          {message.sources.map((s) => (
            <span key={s.title} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-surface px-2 py-0.5 text-[11px] text-slate-500">
              <FileText size={10} aria-hidden />
              {s.title}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A line said in voice mode: plain text, the operator's on the right. */
function SpokenBubble({ role, text, pending }: { role: "user" | "assistant"; text: string; pending?: boolean }) {
  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] break-words px-4 py-2.5 text-sm leading-relaxed ${
          role === "user" ? "rounded-2xl rounded-br-sm bg-brand/10 text-ink" : "rounded-2xl rounded-bl-sm bg-slate-100 text-ink"
        }`}
      >
        {text}
        {pending ? <span className="animate-caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] bg-current opacity-60" aria-hidden /> : null}
      </div>
    </div>
  );
}

/** Marks where a voice session starts in the conversation. */
function VoiceDivider({ at, live }: { at?: string; live?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[11px] text-muted" role="separator">
      <span className="h-px flex-1 bg-line" />
      <span className="inline-flex items-center gap-1">
        <Mic size={11} aria-hidden className={live ? "text-live" : ""} />
        {live ? "Voice, live" : `Voice${at ? ` · ${clock(at)}` : ""}`}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function EmptyConversation({ compact }: { compact: boolean }) {
  const { ask, startVoice } = useAssistant();
  return (
    <div className="flex h-full flex-col items-center justify-center px-2 text-center">
      <BookOpenText size={26} className="text-slate-300" aria-hidden />
      <p className="mt-3 text-sm font-medium text-slate-600">Ask about cases, providers or procedures</p>
      <p className="mt-1 text-xs text-muted">Type, or press the microphone to talk to it.</p>
      <div className={`mt-4 flex flex-wrap justify-center gap-2 ${compact ? "max-w-xs" : "max-w-md"}`}>
        {(compact ? SUGGESTED.slice(0, 3) : SUGGESTED).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void ask(s)}
            className="rounded-full border border-slate-300 bg-surface px-3 py-1.5 text-xs text-slate-600 transition-colors duration-150 hover:border-brand/60 hover:text-brand"
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          onClick={startVoice}
          className="inline-flex items-center gap-1.5 rounded-full border border-live/40 bg-live/5 px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-150 hover:border-live"
        >
          <Mic size={12} aria-hidden className="text-live" />
          Talk to the assistant
        </button>
      </div>
    </div>
  );
}

/** The messages of the open conversation, with what is being said right now. */
export function AssistantMessages({ compact = false }: { compact?: boolean }) {
  const { messages, fresh, busy, loading, liveLines, voice, voiceOn } = useAssistant();
  const boxRef = useRef<HTMLDivElement>(null);
  const pin = useCallback(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, []);
  const partial = voiceOn ? voice.state.partial.agent : "";
  useEffect(pin, [messages, busy, liveLines, partial, pin]);

  const showLive = liveLines.length > 0 || voiceOn;
  const items: ReactNode[] = [];
  let lastCall: string | null = null;
  for (const m of messages) {
    if (m.mode === "voice" && m.callRef !== lastCall) items.push(<VoiceDivider key={`d-${m.id}`} at={m.createdAt} />);
    lastCall = m.mode === "voice" ? m.callRef : null;
    if (m.role === "user") {
      items.push(
        m.mode === "voice" ? (
          <SpokenBubble key={m.id} role="user" text={m.text} />
        ) : (
          <div key={m.id} className="animate-fade-up flex justify-end">
            <div className="max-w-[85%] break-words rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-white shadow-sm">{m.text}</div>
          </div>
        )
      );
    } else {
      items.push(
        m.mode === "voice" ? (
          <SpokenBubble key={m.id} role="assistant" text={m.text} />
        ) : (
          <div key={m.id} className="animate-fade-up flex justify-start">
            <AnswerBubble message={m} fresh={fresh.has(m.id)} onGrow={pin} />
          </div>
        )
      );
    }
  }

  return (
    <div ref={boxRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-1" aria-live="polite">
      {loading && !messages.length ? (
        <div className="space-y-3 pt-2" aria-label="Loading the conversation">
          <div className="ml-auto h-9 w-2/3 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-16 w-4/5 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      ) : !messages.length && !showLive && !busy ? (
        <EmptyConversation compact={compact} />
      ) : null}
      {items}
      {showLive ? (
        <>
          <VoiceDivider live={voiceOn} />
          {liveLines.map((l) => (
            <SpokenBubble key={`live-${l.id}`} role={l.role === "user" ? "user" : "assistant"} text={l.text} />
          ))}
          {partial ? <SpokenBubble role="assistant" text={partial} pending /> : null}
        </>
      ) : null}
      {busy ? <TypingIndicator /> : null}
    </div>
  );
}

/** Voice mode controls on the dark stage: orb, what the assistant is doing, mute and end. */
export function VoiceBar() {
  const { voice, voiceOn, opened, stopVoice } = useAssistant();
  const s = voice.state;
  if (!voiceOn) return null;
  return (
    <div className="animate-fade-up mt-3 flex items-center gap-3 rounded-xl bg-stage px-3 py-2.5 text-stage-ink">
      <VoiceOrb state={orbState(s)} getLevels={voice.getLevels} size={44} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" aria-live="polite">
          {voiceStatus(s)}
        </p>
        <p className="truncate text-xs text-stage-muted">
          {opened ? (
            <Link href={opened.href} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
              <ExternalLink size={11} aria-hidden />
              Opened {opened.label}
            </Link>
          ) : (
            "Ask out loud. Say “open it” to see a record."
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => voice.setMuted(!s.muted)}
        aria-pressed={s.muted}
        aria-label={s.muted ? "Unmute the microphone" : "Mute the microphone"}
        title={s.muted ? "Unmute" : "Mute"}
        disabled={s.phase !== "live" || s.textOnly}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-40 ${
          s.muted ? "bg-stage-ink text-stage" : "bg-stage-raised text-stage-ink ring-1 ring-stage-line hover:bg-stage-line"
        }`}
      >
        {s.muted ? <MicOff size={16} /> : <Mic size={16} />}
      </button>
      <button
        type="button"
        onClick={stopVoice}
        aria-label="End voice mode"
        title="End voice mode"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition-colors duration-150 hover:bg-red-600"
      >
        <PhoneOff size={16} />
      </button>
    </div>
  );
}

/** A voice problem worth saying: no microphone, voice not configured, a dropped session. */
function VoiceNotice() {
  const { voice } = useAssistant();
  const err = voice.state.error;
  if (!err) return null;
  const message =
    err.code === "VOICE_NOT_CONFIGURED" ? "Voice mode needs the voice service, which isn't configured on this server. Typing still works." : err.message;
  return (
    <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${voice.state.phase === "error" ? "bg-red-50 text-red-700" : "bg-warn/10 text-ink"}`} role="alert">
      {message}
    </p>
  );
}

/** Question box with the microphone (voice mode on/off) and send. */
export function AssistantComposer({ autoFocus = false }: { autoFocus?: boolean }) {
  const { draft, setDraft, ask, busy, voiceOn, startVoice, stopVoice, error } = useAssistant();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  return (
    <div className="border-t border-line pt-3">
      {error ? (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <button
          type="button"
          onClick={voiceOn ? stopVoice : startVoice}
          aria-pressed={voiceOn}
          aria-label={voiceOn ? "Turn voice mode off" : "Talk to the assistant (voice mode)"}
          title={voiceOn ? "Turn voice mode off" : "Voice mode"}
          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150 ${
            voiceOn ? "border-live bg-live text-white" : "border-slate-300 bg-surface text-slate-600 hover:border-live hover:text-live"
          }`}
        >
          {voiceOn ? <span className="animate-live-ping absolute inset-0 rounded-lg bg-live/40" aria-hidden /> : null}
          <Mic size={17} className="relative" />
        </button>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={voiceOn ? "Or type to the voice assistant…" : "Ask a question…"}
          aria-label="Ask the assistant a question"
          maxLength={1000}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          aria-label="Ask"
          className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SendHorizonal size={15} />
          <span className="hidden sm:inline">Ask</span>
        </button>
      </form>
      <VoiceNotice />
    </div>
  );
}

const relative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return formatDate(iso).replace(/ \d{4}$/, "");
};

/** Earlier conversations: open one to carry on, or delete it. */
export function AssistantHistory({ className = "" }: { className?: string }) {
  const { threads, refreshThreads, openThread, removeThread, threadId, newConversation } = useAssistant();
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => {
    if (threads === null) void refreshThreads();
  }, [threads, refreshThreads]);

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <button
        type="button"
        onClick={newConversation}
        className="mb-2 inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors duration-150 hover:border-brand hover:text-brand"
      >
        <SquarePen size={15} aria-hidden />
        New conversation
      </button>
      {threads === null ? (
        <div className="space-y-2" aria-label="Loading conversations">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-muted">No earlier conversations yet. They appear here once you&rsquo;ve asked something.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain" aria-label="Earlier conversations">
          {threads.map((t) => (
            <li key={t.id} className="group relative">
              <button
                type="button"
                onClick={() => openThread(t.id)}
                aria-current={t.id === threadId ? "true" : undefined}
                className={`w-full rounded-lg px-3 py-2 pr-9 text-left transition-colors duration-150 ${
                  t.id === threadId ? "bg-brand/10" : "hover:bg-slate-100"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {t.voice ? <Mic size={12} className="shrink-0 text-live" aria-label="Has voice" /> : null}
                  <span className="truncate text-sm font-medium text-ink">{t.title === NEW_TITLE ? "Voice conversation" : t.title}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {relative(t.updatedAt)} · {t.preview}
                </span>
              </button>
              {confirming === t.id ? (
                <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-surface p-0.5 shadow-sm ring-1 ring-line">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      void removeThread(t.id);
                    }}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} className="rounded px-2 py-1 text-xs text-muted hover:bg-slate-100">
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(t.id)}
                  aria-label={`Delete “${t.title}”`}
                  title="Delete"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 opacity-100 transition-opacity duration-150 hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
