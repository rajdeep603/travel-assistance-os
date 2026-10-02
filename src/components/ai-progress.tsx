"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

/**
 * Staged AI-pipeline progress. While `busy` is true it walks through the
 * stage list (holding on the last one until the request finishes), so the
 * audience sees *what* the AI is doing instead of a bare spinner. The stages
 * mirror the real pipeline steps; the timing is presentational.
 */
export function AIPipeline({
  stages,
  busy,
  stepMs = 650,
}: {
  stages: string[];
  busy: boolean;
  stepMs?: number;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!busy) return;
    setActive(0);
    const timer = setInterval(() => {
      setActive((a) => Math.min(a + 1, stages.length - 1));
    }, stepMs);
    return () => clearInterval(timer);
  }, [busy, stages.length, stepMs]);

  if (!busy) return null;

  return (
    <ol className="space-y-2.5" aria-live="polite" aria-label="AI pipeline progress">
      {stages.map((stage, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <li
            key={stage}
            className={`flex items-center gap-2.5 text-sm transition-colors ${
              done
                ? "text-emerald-600"
                : current
                  ? "font-medium text-slate-800"
                  : "text-slate-300"
            }`}
          >
            {done ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100">
                <Check size={12} strokeWidth={3} aria-hidden />
              </span>
            ) : current ? (
              <span className="flex h-5 w-5 items-center justify-center">
                <Loader2 size={16} className="animate-spin text-blue-600" aria-hidden />
              </span>
            ) : (
              <span className="flex h-5 w-5 items-center justify-center">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-200" aria-hidden />
              </span>
            )}
            {stage}
            {current ? <span className="sr-only">(in progress)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
