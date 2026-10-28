"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronRight } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import { formatDay, formatTime } from "@/lib/format";
import { getDisplayTimeZone, timeZoneLabel, utcToWallClock } from "@/lib/time-zone";

// The meetings booked at the show, today's first: at the booth the presenter
// opens Leads and sees the day in order, each meeting opening its lead with
// the brief prepared for it. Earlier days drop off; today's past meetings
// stay, dimmed.

export interface MeetingLead {
  id: string;
  companyName: string;
  customerName: string;
  role: string | null;
  meetingAt: string | null;
  brief: string | null;
}

type Booked = MeetingLead & { meetingAt: string };

/** Days listed before "Show later days". */
const DAYS_SHOWN = 3;
/** A meeting counts as under way for its first 20 minutes. */
const UNDER_WAY_MS = 20 * 60_000;

export function UpcomingMeetings({ leads }: { leads: MeetingLead[] }) {
  const [now, setNow] = useState(() => Date.now());
  const [showAll, setShowAll] = useState(false);
  const zone = getDisplayTimeZone();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { days, today, tomorrow, nextId } = useMemo(() => {
    const today = utcToWallClock(new Date(now), zone).date;
    const tomorrow = utcToWallClock(new Date(now + 86_400_000), zone).date;
    const groups = new Map<string, Booked[]>();
    const upcoming = leads
      .filter((l): l is Booked => Boolean(l.meetingAt))
      .sort((a, b) => a.meetingAt.localeCompare(b.meetingAt))
      .filter((l) => utcToWallClock(new Date(l.meetingAt), zone).date >= today);
    for (const l of upcoming) {
      const day = utcToWallClock(new Date(l.meetingAt), zone).date;
      groups.set(day, [...(groups.get(day) ?? []), l]);
    }
    const next = upcoming.find((l) => new Date(l.meetingAt).getTime() + UNDER_WAY_MS > now);
    return { days: [...groups.entries()], today, tomorrow, nextId: next?.id ?? null };
  }, [leads, now, zone]);

  if (!days.length) return null;
  const shown = showAll ? days : days.slice(0, DAYS_SHOWN);

  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <CalendarClock size={18} aria-hidden />
          </span>
          <SectionTitle>Upcoming meetings</SectionTitle>
        </div>
        <p className="text-xs text-muted">
          Times in <span translate="no">{timeZoneLabel(zone)}</span>
        </p>
      </div>

      <div className="mt-3 space-y-4">
        {shown.map(([day, meetings]) => (
          <section key={day} aria-label={formatDay(meetings[0].meetingAt)}>
            <h4 className="flex items-baseline gap-2 border-b border-line pb-1.5 text-sm font-semibold text-ink">
              {day === today ? "Today" : day === tomorrow ? "Tomorrow" : null}
              <span className={day === today || day === tomorrow ? "font-normal text-muted" : ""}>{formatDay(meetings[0].meetingAt)}</span>
            </h4>
            <ul className="divide-y divide-line">
              {meetings.map((m) => {
                const start = new Date(m.meetingAt).getTime();
                const past = start + UNDER_WAY_MS <= now;
                const brief = m.brief?.split(/\r?\n/).find((line) => line.trim());
                return (
                  <li key={m.id}>
                    <Link
                      href={`/leads/${m.id}`}
                      className={`group -mx-2 grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-canvas md:grid-cols-[3.25rem_minmax(0,16rem)_minmax(0,1fr)_auto] ${
                        past ? "opacity-60" : ""
                      }`}
                    >
                      <span className="text-[15px] font-semibold tabular-nums text-ink">{formatTime(m.meetingAt)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{m.companyName}</span>
                        <span className="block truncate text-sm text-muted">
                          {m.customerName}
                          {m.role ? `, ${m.role}` : ""}
                        </span>
                      </span>
                      <span className="hidden min-w-0 text-sm text-muted md:block">
                        <span className="line-clamp-2">{brief ?? "No brief yet"}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {m.id === nextId ? (
                          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">{start <= now ? "Now" : "Next"}</span>
                        ) : null}
                        <ChevronRight size={16} className="text-slate-400 transition-colors group-hover:text-brand rtl:rotate-180" aria-hidden />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {days.length > DAYS_SHOWN ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-sm font-medium text-brand hover:underline">
          {showAll ? "Show fewer days" : "Show later days"}
        </button>
      ) : null}
    </Card>
  );
}
