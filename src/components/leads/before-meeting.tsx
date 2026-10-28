"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { CalendarClock, Pencil, Save } from "lucide-react";
import { Button, Card, SectionTitle, readApiError } from "@/components/ui";
import { useUiLanguage } from "@/components/i18n";
import { formatDay, formatTime, formatTimeAgo } from "@/lib/format";
import { localeOf } from "@/lib/i18n";
import { getDisplayTimeZone, timeZoneLabel, utcToWallClock, wallClockToUtc } from "@/lib/time-zone";

// "Before the meeting": when the meeting is and the presenter's brief (who
// they are, what to probe, what to show), at the top of the lead so it's the
// first thing read on the way in. Edited in place; the time is typed on the
// display clock, like every time on screen.

export interface MeetingPrep {
  /** ISO instant from the API. */
  meetingAt: string | null;
  brief: string | null;
}

// 16 px on touch screens, so the iPad doesn't zoom into the field.
const FIELD =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 [@media(hover:none)]:text-base";
const LABEL = "block text-xs font-medium text-muted";

export function BeforeMeeting({
  leadId,
  value,
  startEditing = false,
  onSaved,
  onCancel,
}: {
  leadId: string;
  value: MeetingPrep;
  /** Opened from "Add a meeting brief", with nothing to show yet. */
  startEditing?: boolean;
  onSaved: (value: MeetingPrep) => void;
  /** Cancelled before anything was saved. */
  onCancel?: () => void;
}) {
  const { lang } = useUiLanguage();
  const zone = getDisplayTimeZone();
  const ids = { date: useId(), time: useId(), brief: useId() };
  const toForm = (v: MeetingPrep) => {
    const wall = v.meetingAt ? utcToWallClock(new Date(v.meetingAt), zone) : null;
    return { date: wall?.date ?? "", time: wall?.time ?? "", brief: v.brief ?? "" };
  };
  const [editing, setEditing] = useState(startEditing);
  const [form, setForm] = useState(() => toForm(value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  function edit() {
    setForm(toForm(value));
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
    if (!value.meetingAt && !value.brief) onCancel?.();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (Boolean(form.date) !== Boolean(form.time)) {
      setError("Give both the day and the time, or neither.");
      return;
    }
    const at = form.date ? wallClockToUtc(form.date, form.time, zone) : null;
    if (at && Number.isNaN(at.getTime())) {
      setError("That day or time isn't valid.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingAt: at ? at.toISOString() : null, brief: form.brief }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "The brief couldn't be saved."));
      const { lead } = (await res.json()) as { lead: MeetingPrep };
      onSaved({ meetingAt: lead.meetingAt, brief: lead.brief });
      setEditing(false);
      if (!lead.meetingAt && !lead.brief) onCancel?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The brief couldn't be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <CalendarClock size={18} aria-hidden />
          </span>
          <SectionTitle>Before the meeting</SectionTitle>
        </div>
        {editing ? null : (
          <Button variant="secondary" onClick={edit}>
            <Pencil size={14} aria-hidden />
            Edit
          </Button>
        )}
      </div>

      {editing ? (
        <form className="mt-4 space-y-3" onSubmit={(e) => void save(e)}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,8rem)_minmax(0,1fr)] sm:items-end">
            <div>
              <label htmlFor={ids.date} className={LABEL}>
                Day
              </label>
              <input id={ids.date} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={FIELD} />
            </div>
            <div>
              <label htmlFor={ids.time} className={LABEL}>
                Time
              </label>
              <input
                id={ids.time}
                type="time"
                step={300}
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                className={`${FIELD} tabular-nums`}
              />
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-xs text-muted">
              <span>
                Times in <span translate="no">{timeZoneLabel(zone)}</span>
              </span>
              {form.date || form.time ? (
                <button type="button" onClick={() => setForm((f) => ({ ...f, date: "", time: "" }))} className="font-medium text-brand hover:underline">
                  Clear the time
                </button>
              ) : null}
            </p>
          </div>
          <div>
            <label htmlFor={ids.brief} className={LABEL}>
              Brief
            </label>
            <textarea
              id={ids.brief}
              value={form.brief}
              onChange={(e) => setForm((f) => ({ ...f, brief: e.target.value }))}
              rows={6}
              maxLength={4000}
              placeholder="Who they are, what to probe, what to show…"
              className={FIELD}
            />
          </div>
          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy}>
              {busy ? null : <Save size={15} aria-hidden />}
              Save
            </Button>
            <Button variant="secondary" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="rounded-xl bg-canvas px-4 py-3">
            {value.meetingAt ? (
              <>
                <p className="text-3xl font-bold tracking-tight tabular-nums text-ink">{formatTime(value.meetingAt)}</p>
                <p className="text-sm font-medium text-ink">{formatDay(value.meetingAt)}</p>
                <p className="mt-1 text-xs text-muted">
                  {formatTimeAgo(value.meetingAt, localeOf(lang), new Date(now))} · <span translate="no">{timeZoneLabel(zone)}</span>
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">No time set</p>
            )}
          </div>
          <div className="min-w-0">
            <p className={LABEL}>Brief</p>
            {value.brief ? (
              <p className="mt-1 max-w-3xl whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{value.brief}</p>
            ) : (
              <p className="mt-1 text-sm text-muted">No brief yet: who they are, what to probe, what to show.</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
