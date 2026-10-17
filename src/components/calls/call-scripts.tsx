"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDown, FolderSearch, Globe, Hospital, Info, PlaneTakeoff, ReceiptText, Siren, Stethoscope, type LucideIcon } from "lucide-react";
import { HOTLINE_SCRIPTS, type CallScript, type ScriptIcon } from "@/lib/voice/call-scripts";

// ---------------------------------------------------------------------------
// Call scripts under the hotline number: pick a purpose, read your lines
// aloud, and see under each what the agent should say back.
// ---------------------------------------------------------------------------

const ICONS: Record<ScriptIcon, LucideIcon> = {
  delay: PlaneTakeoff,
  case: FolderSearch,
  doctor: Stethoscope,
  claim: ReceiptText,
  hospital: Hospital,
  emergency: Siren,
};

/** Keeps references (POL-TR-100945, CLM-10241) on one line. */
function Line({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\b[A-Z]{2,4}(?:-[A-Z0-9]+)+\b)/).map((part, i) =>
        i % 2 ? (
          <span key={i} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}

function ScriptBody({ script, note }: { script: CallScript; note?: string }) {
  return (
    <div className="animate-fade-in pb-4 pl-11 pr-1">
      <p className="text-xs text-muted">
        You play{" "}
        <span className="font-medium text-ink">
          <Line text={script.youPlay} />
        </span>
      </p>
      <ol className="mt-3 space-y-3">
        {script.turns.map((turn, i) => (
          <li key={i} className="relative pl-7">
            <span className="absolute left-0 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] font-semibold tabular-nums text-white">
              {i + 1}
            </span>
            <p className="text-[15px] font-medium leading-snug text-ink">
              &ldquo;
              <Line text={turn.say} />
              &rdquo;
            </p>
            <p className="mt-1 text-xs leading-snug text-muted">
              <span className="font-semibold text-ai">Agent:</span> <Line text={turn.hear} />
            </p>
          </li>
        ))}
      </ol>
      {note ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-warn/10 px-2.5 py-2 text-xs text-ink">
          <Info size={13} className="mt-px shrink-0 text-amber-700" aria-hidden />
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function CallScripts({ doctorOnCall, rehearse }: { doctorOnCall: boolean; rehearse: boolean }) {
  const [open, setOpen] = useState<string | null>(HOTLINE_SCRIPTS[0].id);
  const base = useId();
  // Without a doctor's number the emergency script ends in a call-back promise, not a transfer.
  const noteFor = (s: CallScript) =>
    s.id === "emergency" && !doctorOnCall
      ? "No on-call doctor's number is set up, so the agent marks the case urgent and promises a doctor's call back within 15 minutes."
      : s.note;

  return (
    <section aria-labelledby={`${base}-title`} className="mt-5 border-t border-line pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={`${base}-title`} className="text-sm font-semibold text-ink">
          Call scripts
        </h3>
        {rehearse ? (
          <Link href="/voice?agent=inbound-hotline" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            <Globe size={12} aria-hidden />
            Rehearse in the browser
          </Link>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted">Read your lines aloud. Under each is what the agent should say back.</p>

      <ul className="mt-2 divide-y divide-line">
        {HOTLINE_SCRIPTS.map((s) => {
          const Icon = ICONS[s.icon];
          const expanded = open === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                id={`${base}-${s.id}`}
                aria-expanded={expanded}
                aria-controls={`${base}-${s.id}-body`}
                onClick={() => setOpen(expanded ? null : s.id)}
                className="group flex w-full items-center gap-3 rounded-lg py-3 text-left"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${
                    expanded ? "bg-brand text-white" : s.icon === "emergency" ? "bg-red-50 text-red-600" : "bg-brand/10 text-brand group-hover:bg-brand/15"
                  }`}
                >
                  <Icon size={16} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{s.title}</span>
                  <span className="block text-xs text-muted">{s.purpose}</span>
                </span>
                <ChevronDown
                  size={16}
                  aria-hidden
                  className={`shrink-0 text-slate-400 transition-transform duration-150 ${expanded ? "rotate-180 text-brand" : ""}`}
                />
              </button>
              {expanded ? (
                <div id={`${base}-${s.id}-body`} role="region" aria-labelledby={`${base}-${s.id}`}>
                  <ScriptBody script={s} note={noteFor(s)} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
