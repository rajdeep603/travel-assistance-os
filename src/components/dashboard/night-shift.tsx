import Link from "next/link";
import { ChevronLeft, ChevronRight, Moon } from "lucide-react";
import { formatDayTime, formatTime } from "@/lib/format";
import { OPERATION_TIME_ZONE, timeZoneLabel } from "@/lib/time-zone";
import type { HandoverEvent, ShiftHandover } from "@/lib/services/shift-handover";
import { T } from "@/components/i18n";

// ---------------------------------------------------------------------------
// The night-shift handover on the overview: what the AI did between 20:00 and
// 08:00 while the team was off, the moments that mattered, and what it left
// for the morning. The night is always named by its date, and the presenter
// can step to another night with activity.
// ---------------------------------------------------------------------------

const MAX_EVENTS = 7;

const DOT: Record<HandoverEvent["tone"], string> = {
  emergency: "bg-red-600",
  ai: "bg-ai",
  person: "bg-warn",
};


function NightLink({ night, label, children }: { night: string | null; label: string; children: React.ReactNode }) {
  const cls = "flex h-8 w-8 items-center justify-center rounded-lg border border-line transition-colors duration-150";
  return night ? (
    <Link href={`/?night=${night}#night-shift`} scroll={false} aria-label={label} className={`${cls} text-ink hover:bg-canvas`}>
      {children}
    </Link>
  ) : (
    <span aria-hidden className={`${cls} text-line`}>
      {children}
    </span>
  );
}

export function NightShift({ handover: h, waiting, timeZone = OPERATION_TIME_ZONE }: { handover: ShiftHandover; waiting: number; timeZone?: string }) {
  const index = h.nights.findIndex((n) => n.night === h.night);
  const older = index >= 0 ? (h.nights[index + 1]?.night ?? null) : null;
  const newer = index > 0 ? h.nights[index - 1].night : null;
  const shown = h.events.slice(0, MAX_EVENTS);
  // The shift is 20:00 to 08:00 where the operation runs; shown in the viewer's clock.
  const clock = (at: Date) => formatTime(at, timeZone);
  const span = `${formatDayTime(h.start, timeZone)} to ${formatDayTime(h.end, timeZone)}`;
  const zoneNote = timeZone === OPERATION_TIME_ZONE ? "" : ` · ${timeZoneLabel(timeZone)} time`;

  const figures = [
    { value: `${h.calls.byAi}`, label: "calls handled by AI", note: h.calls.total ? `of ${h.calls.total}; ${h.calls.transferred} handed to a person` : "no calls" },
    { value: `${h.calls.emergencies}`, label: "emergencies put through to a doctor", note: "the AI opened the case and briefed them" },
    { value: `${h.cases.opened}`, label: "cases opened", note: h.cases.critical ? `${h.cases.critical} critical` : "with urgency and place set" },
    { value: `${h.lettersSent}`, label: "guarantees sent to hospitals", note: h.inbox.received ? `${h.inbox.automated} of ${h.inbox.received} e-mails and faxes handled` : "no e-mails or faxes overnight" },
  ];

  return (
    <section id="night-shift" aria-labelledby="night-title" className="scroll-mt-20 rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="night-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Moon size={17} className="text-brand" aria-hidden />
            <T>While your team slept</T>
          </h2>
          <p className="mt-0.5 text-xs tabular-nums text-muted">
            Night shift {span}{h.inProgress ? " · still running" : ""}{zoneNote}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <NightLink night={older} label="An earlier night">
            <ChevronLeft size={16} className="rtl:rotate-180" aria-hidden />
          </NightLink>
          <NightLink night={newer} label="A later night">
            <ChevronRight size={16} className="rtl:rotate-180" aria-hidden />
          </NightLink>
        </div>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            {figures.map((f) => (
              <div key={f.label} className="min-w-0">
                <p className="text-3xl font-semibold tracking-tight tabular-nums text-ink">{f.value}</p>
                <p className="text-sm font-medium leading-snug text-ink">{f.label}</p>
                <p className="text-xs leading-snug text-muted">{f.note}</p>
              </div>
            ))}
          </div>
          {h.calls.languages.length ? (
            <p className="mt-4 text-xs text-muted">
              <span className="font-medium text-ink">Languages:</span> {h.calls.languages.join(", ")}
            </p>
          ) : null}
          <Link
            href="#needs-title"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-warn/10 px-3 py-2 text-sm font-medium text-amber-800 transition-colors duration-150 hover:bg-warn/20"
          >
            {waiting ? `${waiting} ${waiting === 1 ? "decision" : "decisions"} waiting for the morning shift` : "Nothing waiting for the morning shift"}
          </Link>
        </div>

        <ol className="relative space-y-3 border-l border-line pl-5" aria-label="The night, in order">
          {shown.map((e) => (
            <li key={`${e.kind}-${e.href}-${e.at.toISOString()}`} className="relative">
              <span aria-hidden className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${DOT[e.tone]}`} />
              <Link href={e.href} className="group block rounded-lg">
                <p className="text-sm text-ink">
                  <span className="mr-2 tabular-nums text-muted">{clock(e.at)}</span>
                  <span className="font-medium group-hover:text-brand">{e.title}</span>
                </p>
                {e.detail ? <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">{e.detail}</p> : null}
              </Link>
            </li>
          ))}
          {h.events.length > shown.length ? <li className="text-xs text-muted">and {h.events.length - shown.length} more</li> : null}
        </ol>
      </div>
    </section>
  );
}
