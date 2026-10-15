"use client";

import { AnimatePresence, motion } from "motion/react";

// ---------------------------------------------------------------------------
// The trail: a sequence of AI steps drawn as stops on a route. The line fills
// as each stop completes, so the audience sees how far the work has got.
// Used for the voice agent's tool calls and the module AI pipelines.
// ---------------------------------------------------------------------------

export type TrailStatus = "pending" | "running" | "done" | "error";

export interface TrailStop {
  id: string;
  label: string;
  status: TrailStatus;
  /** A second line, e.g. why a step failed. */
  detail?: string;
}

const TONES = {
  light: {
    track: "bg-line",
    fill: "bg-brand",
    pendingRing: "border-slate-300",
    running: "text-ink font-medium",
    done: "text-muted",
    pending: "text-slate-400",
    detail: "text-amber-700",
    spinnerTrack: "stroke-brand/15",
  },
  stage: {
    track: "bg-stage-line",
    fill: "bg-brand-2",
    pendingRing: "border-stage-line",
    running: "text-stage-ink font-medium",
    done: "text-stage-muted",
    pending: "text-stage-muted/60",
    detail: "text-amber-300",
    spinnerTrack: "stroke-white/10",
  },
} as const;

export function Trail({
  stops,
  tone = "light",
  label,
}: {
  stops: TrailStop[];
  tone?: keyof typeof TONES;
  /** Accessible name for the list. */
  label: string;
}) {
  const t = TONES[tone];
  return (
    <ol aria-label={label} aria-live="polite" className="relative">
      <AnimatePresence initial={false}>
        {stops.map((stop, i) => {
          const last = i === stops.length - 1;
          return (
            <motion.li
              key={stop.id}
              layout="position"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={`relative flex gap-3 ${last ? "" : "pb-3"}`}
            >
              {/* The route segment down to the next stop. */}
              {last ? null : (
                <span className={`absolute left-[9px] top-6 bottom-0 w-0.5 overflow-hidden rounded-full ${t.track}`} aria-hidden>
                  <span
                    className={`block h-full w-full origin-top rounded-full transition-transform duration-300 ease-smooth ${t.fill} ${
                      stop.status === "done" ? "scale-y-100" : "scale-y-0"
                    }`}
                  />
                </span>
              )}
              <StopNode status={stop.status} tone={tone} />
              <span className={`min-w-0 pt-px text-sm leading-5 transition-colors ${t[stop.status === "error" ? "running" : stop.status]}`}>
                {stop.label}
                {stop.detail ? <span className={`block text-xs ${t.detail}`}>{stop.detail}</span> : null}
                {stop.status === "running" ? <span className="sr-only"> (in progress)</span> : null}
                {stop.status === "error" ? <span className="sr-only"> (failed)</span> : null}
              </span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

function StopNode({ status, tone }: { status: TrailStatus; tone: keyof typeof TONES }) {
  const t = TONES[tone];
  if (status === "done") {
    return (
      <span className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${t.fill}`} aria-hidden>
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
          <path
            d="M2.5 6.2l2.3 2.3 4.7-5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-draw"
            style={{ ["--dash" as string]: 12 }}
          />
        </svg>
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white" aria-hidden>
        !
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
        <svg viewBox="0 0 20 20" className="absolute inset-0 h-5 w-5 animate-spin">
          <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2.5" className={t.spinnerTrack} />
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="14 40"
            className={tone === "stage" ? "stroke-brand-2" : "stroke-brand"}
          />
        </svg>
        <span className={`h-1.5 w-1.5 rounded-full ${tone === "stage" ? "bg-brand-2" : "bg-brand"}`} />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
      <span className={`h-2.5 w-2.5 rounded-full border-2 ${t.pendingRing}`} />
    </span>
  );
}
