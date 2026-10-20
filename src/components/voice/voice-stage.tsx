"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarCheck2 } from "lucide-react";
import { Elapsed } from "@/components/elapsed";
import { Trail } from "@/components/trail";
import { VoiceOrb, type LevelReader, type OrbState } from "@/components/voice/voice-orb";
import { useMediaQuery } from "@/lib/client/use-media-query";
import { toolActivityLabel } from "@/lib/voice/tool-labels";
import { toolSteps } from "@/lib/voice/tool-steps";
import type { Booking, ToolActivity, TranscriptLine } from "@/lib/voice/client/use-grok-voice";

const CAPTION_CHARS = 170;

/** Keep in step with the `short` variant in tailwind.config.ts. */
const SHORT_SCREEN = "(max-height: 820px)";

/** The tail of a long utterance, cut at a word, so the caption stays a few lines. */
function captionTail(text: string): string {
  if (text.length <= CAPTION_CHARS) return text;
  const tail = text.slice(-CAPTION_CHARS);
  const space = tail.indexOf(" ");
  return `…${space > 0 ? tail.slice(space + 1) : tail}`;
}

/** What is being said right now: the agent's sentence in progress, else the last line. */
function currentCaption(lines: TranscriptLine[], partialAgent: string) {
  if (partialAgent) return { role: "agent" as const, text: partialAgent, pending: true };
  const last = lines[lines.length - 1];
  return last ? { role: last.role, text: last.text, pending: false } : null;
}

/**
 * The dark stage on the voice page: the orb, what the agent is doing, the
 * words being spoken, the steps it has taken and the call controls. Built to
 * be read from a few metres away at a booth.
 */
export function VoiceStage({
  orb,
  getLevels,
  title,
  detail,
  live,
  startedAt,
  callRef,
  agentLabel,
  transcript,
  partialAgent,
  tools,
  booking,
  idleHint,
  controls,
  footnote,
}: {
  orb: OrbState;
  getLevels: LevelReader;
  title: string;
  detail: string;
  live: boolean;
  startedAt: number | null;
  callRef: string | null;
  agentLabel: string | null;
  transcript: TranscriptLine[];
  partialAgent: string;
  tools: ToolActivity[];
  booking: Booking | null;
  idleHint: string;
  controls: ReactNode;
  footnote?: ReactNode;
}) {
  const caption = currentCaption(transcript, partialAgent);
  const steps = toolSteps(tools);
  // Short screens (an iPad in landscape) get a smaller orb, so the controls stay above the fold.
  const short = useMediaQuery(SHORT_SCREEN);

  return (
    <section
      aria-label="Voice agent"
      className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-stage text-stage-ink shadow-xl shadow-stage/20"
    >
      {/* A low light behind the orb, so the stage has depth without a pattern. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ background: "radial-gradient(closest-side, rgb(var(--c-brand) / 0.18), transparent)" }}
      />

      <div className="relative flex items-center justify-between gap-3 px-5 pt-5 text-sm md:px-7 md:pt-6">
        <p className="min-w-0 truncate text-stage-muted">
          {callRef ? <span className="font-medium text-stage-ink">{callRef}</span> : "Voice agent"}
          {agentLabel ? <span> · {agentLabel}</span> : null}
        </p>
        {live && startedAt ? (
          <span className="flex shrink-0 items-center gap-2 rounded-full bg-stage-raised px-3 py-1 text-xs font-medium">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="animate-live-ping absolute inset-0 rounded-full bg-live" />
              <span className="relative h-2 w-2 rounded-full bg-live" />
            </span>
            Live <Elapsed since={startedAt} />
          </span>
        ) : null}
      </div>

      {/* Centred in whatever height the stage is given. */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-5 pb-6 pt-2 text-center short:pb-5 md:px-10">
        <VoiceOrb state={orb} getLevels={getLevels} size={short ? 184 : 232} />
        <p className="-mt-2 text-2xl font-semibold tracking-tight" aria-live="polite">
          {title}
        </p>
        <p className="mt-1 max-w-md text-sm text-stage-muted">{detail}</p>

        {/* Live caption: fixed height so the stage doesn't jump as words arrive. */}
        <div className="mt-5 flex min-h-[5.5rem] w-full max-w-2xl items-center justify-center short:mt-3 short:min-h-[4.5rem]">
          {caption ? (
            <p
              className={`text-lg font-medium leading-snug md:text-xl ${caption.role === "user" ? "text-live" : "text-stage-ink"}`}
            >
              <span className="sr-only">{caption.role === "user" ? "Caller: " : "Agent: "}</span>
              {captionTail(caption.text)}
              {caption.pending ? (
                <span className="animate-caret ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.18em] bg-brand-2" aria-hidden />
              ) : null}
            </p>
          ) : (
            <p className="text-base text-stage-muted">{idleHint}</p>
          )}
        </div>

        <AnimatePresence>
          {booking ? (
            <motion.p
              key="booked"
              initial={{ opacity: 0, scale: 0.85, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 26 }}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-400/30"
            >
              <CalendarCheck2 size={16} aria-hidden />
              Appointment booked · {booking.appointment.ref}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <div className="mt-5 flex items-center justify-center gap-3 short:mt-3">{controls}</div>
      </div>

      <div className="relative border-t border-stage-line/70 px-5 py-5 short:py-4 md:px-7">
        <p className="mb-3 text-sm font-medium text-stage-ink">What the agent did</p>
        {steps.length ? (
          <Trail
            tone="stage"
            label="Agent steps"
            stops={steps.map((s) => ({
              id: s.id,
              label: toolActivityLabel(s.name),
              status: s.status,
              detail: s.summary,
            }))}
          />
        ) : (
          <p className="text-sm text-stage-muted">
            Searches, bookings and case updates appear here as the agent works, against the live database.
          </p>
        )}
        {footnote ? <div className="mt-4 text-xs text-stage-muted">{footnote}</div> : null}
      </div>
    </section>
  );
}

/** A round control on the stage (mute, end). */
export function StageButton({
  children,
  label,
  onClick,
  tone = "neutral",
  pressed,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "danger";
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-brand-2 active:scale-95 ${
        tone === "danger"
          ? "bg-red-500 text-white hover:bg-red-600"
          : pressed
            ? "bg-stage-ink text-stage"
            : "bg-stage-raised text-stage-ink ring-1 ring-stage-line hover:bg-stage-line"
      }`}
    >
      {children}
    </button>
  );
}
