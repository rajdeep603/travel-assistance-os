"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarClock, CalendarPlus, CheckCircle2, Copy, ExternalLink, Send, X } from "lucide-react";
import { Button, ErrorBanner, readApiError } from "@/components/ui";
import { CALL_MINUTES, DEFAULT_CALL_MINUTES, MAX_CALL_ATTENDEES, callDraft, describeCallSlot, defaultCallSlot } from "@/lib/calls";
import { formatPlainDate } from "@/lib/time";
import {
  TIME_ZONES,
  TIME_ZONE_REGIONS,
  getDisplayTimeZone,
  isTimeZone,
  timeZoneLabel,
  timeZoneOffset,
  utcToWallClock,
  wallClockToUtc,
} from "@/lib/time-zone";

// Propose a Teams call: a day and time on the customer's clock, who is
// invited and what the invite says. Microsoft 365 creates the call in the
// organiser's Outlook calendar and sends the invite from there. The same
// panel moves a booked call to another time.

/** A Teams call as the API returns it. */
export interface CallRecord {
  id: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  attendees: string[];
  organizer: string;
  joinUrl: string | null;
  webLink: string | null;
  status: "SCHEDULED" | "CANCELLED";
  createdBy: string | null;
}

/** What booking or moving a call changed on the lead. */
export interface LeadAfterCall {
  status: string;
  nextStep: string | null;
  nextStepOn: string | null;
}

type Availability = "free" | "busy" | "unknown";

const FIELD =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:text-sm";
const LABEL = "text-sm font-medium text-slate-700";

const splitAddresses = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
const looksLikeEmail = (a: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a);

export function ProposeCall({
  organizer,
  customerName,
  email,
  quoteNumber,
  fileLead,
  filesQuotation = false,
  meeting,
  onBooked,
  onClose,
}: {
  /** The mailbox the invite comes from. */
  organizer: string;
  customerName: string;
  email: string;
  quoteNumber: string | null;
  /** The lead the call goes on; from the quotation, this files the quotation first. */
  fileLead: () => Promise<{ id: string; ref: string }>;
  /** Opened from the quotation, which is filed as a lead on the way if it isn't yet. */
  filesQuotation?: boolean;
  /** A booked call to move, instead of proposing a new one. */
  meeting?: CallRecord;
  /** `filed` is the lead the call went on, when it was filed on the way (from the quotation). */
  onBooked: (result: { meeting: CallRecord; lead: LeadAfterCall; filed: { id: string; ref: string } | null }) => void;
  onClose: () => void;
}) {
  const moving = Boolean(meeting);
  const viewerZone = getDisplayTimeZone();
  const [timeZone, setTimeZone] = useState(() => meeting?.timeZone ?? viewerZone);
  const [slot, setSlot] = useState(() => (meeting ? utcToWallClock(new Date(meeting.startsAt), meeting.timeZone) : defaultCallSlot(viewerZone)));
  const [minutes, setMinutes] = useState<number>(() =>
    meeting ? Math.round((Date.parse(meeting.endsAt) - Date.parse(meeting.startsAt)) / 60_000) : DEFAULT_CALL_MINUTES
  );
  const draft = useMemo(() => callDraft({ customerName, quoteNumber }), [customerName, quoteNumber]);
  const [to, setTo] = useState(email);
  const [others, setOthers] = useState("");
  const [subject, setSubject] = useState(draft.subject);
  const [message, setMessage] = useState(draft.message);
  const [availability, setAvailability] = useState<Availability | "checking" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CallRecord | null>(null);
  const [copied, setCopied] = useState(false);

  const titleId = useId();
  const ids = { date: useId(), time: useId(), minutes: useId(), zone: useId(), to: useId(), others: useId(), subject: useId(), message: useId() };
  const firstRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // On top of whatever opened it (the quotation is a dialog itself): Escape
  // closes this panel only, and focus goes back where it was.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const startsAt = useMemo(() => wallClockToUtc(slot.date, slot.time, timeZone), [slot, timeZone]);
  const valid = !Number.isNaN(startsAt.getTime());
  const inPast = valid && startsAt.getTime() < Date.now() + 60_000;
  const viewerTime = valid && timeZone !== viewerZone ? utcToWallClock(startsAt, viewerZone) : null;
  const today = useMemo(() => utcToWallClock(new Date(), timeZone).date, [timeZone]);

  // A quiet look at the organiser's calendar once the time settles.
  useEffect(() => {
    if (!valid || inPast) {
      setAvailability(null);
      return;
    }
    setAvailability("checking");
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const q = new URLSearchParams({ date: slot.date, time: slot.time, timeZone, minutes: String(minutes) });
      fetch(`/api/meetings/availability?${q}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { availability: "unknown" }))
        .then((body: { availability?: Availability }) => setAvailability(body.availability ?? "unknown"))
        .catch((err: unknown) => {
          if (!(err instanceof DOMException && err.name === "AbortError")) setAvailability("unknown");
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slot.date, slot.time, timeZone, minutes, valid, inPast]);

  const zones = useMemo(() => (TIME_ZONES.some((z) => z.id === timeZone) || !isTimeZone(timeZone) ? TIME_ZONES : [...TIME_ZONES, { id: timeZone, label: timeZoneLabel(timeZone), region: "UTC" as const }]), [timeZone]);

  async function send() {
    setError(null);
    if (!valid) return setError("Pick a day and a start time.");
    if (inPast) return setError("That time has already passed. Pick a later one.");
    const attendees = [...new Set([...splitAddresses(to), ...splitAddresses(others)])];
    if (!moving) {
      if (!splitAddresses(to).length) return setError("Enter the customer's e-mail address.");
      const wrong = attendees.find((a) => !looksLikeEmail(a));
      if (wrong) return setError(`${wrong} isn't an e-mail address.`);
      if (attendees.length > MAX_CALL_ATTENDEES) return setError(`Invite at most ${MAX_CALL_ATTENDEES} people.`);
      if (!subject.trim()) return setError("Enter a subject for the invite.");
    }
    setBusy(true);
    try {
      const body = { date: slot.date, time: slot.time, timeZone, minutes };
      let res: Response;
      let filed: { id: string; ref: string } | null = null;
      if (meeting) {
        res = await fetch(`/api/meetings/${meeting.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      } else {
        filed = await fileLead();
        res = await fetch(`/api/leads/${filed.id}/meetings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, attendees, subject: subject.trim(), message: message.trim() }),
        });
      }
      if (!res.ok) throw new Error(await readApiError(res, moving ? "The call couldn't be moved. Please try again." : "The invite couldn't be sent. Please try again."));
      const result = (await res.json()) as { meeting: CallRecord; lead: LeadAfterCall };
      setDone(result.meeting);
      onBooked({ ...result, filed });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The invite couldn't be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!done?.joinUrl) return;
    try {
      await navigator.clipboard.writeText(done.joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard refused (an old browser, no permission): the link is in the invite anyway.
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex animate-fade-in items-end justify-center bg-ink/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-card sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            {moving ? <CalendarClock size={18} aria-hidden /> : <CalendarPlus size={18} aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {moving ? "Move the call" : "Propose a call"}
            </h2>
            <p className="text-xs text-muted [overflow-wrap:anywhere]">
              Microsoft Teams, from <bdi>{organizer}</bdi>
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition-colors duration-150 hover:bg-canvas hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        {done ? (
          <div ref={doneRef} tabIndex={-1} className="space-y-4 overflow-y-auto px-5 py-5 focus:outline-none" role="status">
            <p className="flex items-start gap-2 text-sm text-emerald-800">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
              <span>
                {moving ? "Moved. Everyone invited gets the new time from Outlook." : "Invite sent. The call is in your Outlook calendar, with a Teams link."}
              </span>
            </p>
            <div className="rounded-xl bg-canvas p-4 ring-1 ring-line">
              <p className="text-sm font-semibold text-ink">{describeCallSlot(done.startsAt, done.endsAt, done.timeZone)}</p>
              {done.timeZone !== viewerZone ? <p className="mt-0.5 text-xs text-muted">{describeCallSlot(done.startsAt, done.endsAt, viewerZone)}</p> : null}
              <p className="mt-2 text-xs text-muted [overflow-wrap:anywhere]">{done.attendees.join(", ")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {done.joinUrl ? (
                <Button variant="secondary" onClick={() => void copyLink()}>
                  {copied ? <CheckCircle2 size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
                  {copied ? "Copied" : "Copy Teams link"}
                </Button>
              ) : null}
              {done.webLink ? (
                <a
                  href={done.webLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-deep"
                >
                  <ExternalLink size={15} aria-hidden />
                  Open in Outlook
                </a>
              ) : null}
              <Button className="ms-auto" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {error ? <ErrorBanner message={error} /> : null}

              <fieldset className="min-w-0">
                <legend className="sr-only">When</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor={ids.date} className={LABEL}>
                      Day
                    </label>
                    <input
                      ref={firstRef}
                      id={ids.date}
                      type="date"
                      min={today}
                      value={slot.date}
                      onChange={(e) => setSlot((s) => ({ ...s, date: e.target.value }))}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label htmlFor={ids.time} className={LABEL}>
                      Starts at
                    </label>
                    <input
                      id={ids.time}
                      type="time"
                      step={300}
                      value={slot.time}
                      onChange={(e) => setSlot((s) => ({ ...s, time: e.target.value }))}
                      className={`${FIELD} tabular-nums`}
                    />
                  </div>
                  <div>
                    <label htmlFor={ids.minutes} className={LABEL}>
                      Length
                    </label>
                    <select id={ids.minutes} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={FIELD}>
                      {CALL_MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {m} min
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <label htmlFor={ids.zone} className={LABEL}>
                    Time zone
                  </label>
                  <select id={ids.zone} value={timeZone} onChange={(e) => setTimeZone(e.target.value)} className={FIELD}>
                    {TIME_ZONE_REGIONS.map((region) => {
                      const inRegion = zones.filter((z) => z.region === region);
                      return inRegion.length ? (
                        <optgroup key={region} label={region === "Operation" ? "Where the operation runs" : region}>
                          {inRegion.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.label} · {timeZoneOffset(z.id)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null;
                    })}
                  </select>
                  <p className="mt-1 text-xs text-muted">
                    The customer&apos;s clock; the invite shows in each person&apos;s own.
                    {viewerTime ? (
                      <>
                        {" "}
                        For you that&apos;s <span className="font-medium tabular-nums text-ink">{viewerTime.time}</span>
                        {viewerTime.date !== slot.date ? <> on {formatPlainDate(viewerTime.date)}</> : null} {timeZoneLabel(viewerZone)} time.
                      </>
                    ) : null}
                  </p>
                </div>
                <p className="mt-2 min-h-5 text-xs" aria-live="polite">
                  {inPast ? (
                    <span className="inline-flex items-center gap-1.5 text-warn">
                      <AlertTriangle size={14} aria-hidden />
                      That time has already passed.
                    </span>
                  ) : availability === "checking" ? (
                    <span className="text-muted">Checking your calendar…</span>
                  ) : availability === "free" ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700">
                      <CheckCircle2 size={14} aria-hidden />
                      Free in your Outlook calendar.
                    </span>
                  ) : availability === "busy" ? (
                    <span className="inline-flex items-center gap-1.5 text-warn">
                      <AlertTriangle size={14} aria-hidden />
                      Something else is in your calendar then.
                    </span>
                  ) : null}
                </p>
              </fieldset>

              {moving ? (
                <p className="text-sm text-muted [overflow-wrap:anywhere]">
                  {meeting!.subject} · {meeting!.attendees.join(", ")}
                </p>
              ) : (
                <>
                  <fieldset className="min-w-0 space-y-3">
                    <legend className="sr-only">Who</legend>
                    <div>
                      <label htmlFor={ids.to} className={LABEL}>
                        Customer&apos;s e-mail
                      </label>
                      <input id={ids.to} type="email" autoComplete="off" maxLength={200} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" className={FIELD} />
                    </div>
                    <div>
                      <label htmlFor={ids.others} className={LABEL}>
                        Also invite <span className="text-muted">(optional)</span>
                      </label>
                      <input
                        id={ids.others}
                        type="text"
                        inputMode="email"
                        autoComplete="off"
                        maxLength={600}
                        value={others}
                        onChange={(e) => setOthers(e.target.value)}
                        placeholder="Colleagues on either side, separated by commas"
                        className={FIELD}
                      />
                    </div>
                  </fieldset>
                  <fieldset className="min-w-0 space-y-3">
                    <legend className="sr-only">The invite</legend>
                    <div>
                      <label htmlFor={ids.subject} className={LABEL}>
                        Subject
                      </label>
                      <input id={ids.subject} type="text" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className={FIELD} />
                    </div>
                    <div>
                      <label htmlFor={ids.message} className={LABEL}>
                        Message
                      </label>
                      <textarea id={ids.message} rows={7} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} className={`${FIELD} leading-relaxed`} />
                      <p className="mt-1 text-xs text-muted">Teams adds the link to join below it.</p>
                    </div>
                  </fieldset>
                </>
              )}
            </div>

            <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
              <p className="min-w-0 flex-1 text-xs text-muted">
                {moving
                  ? "Everyone invited gets the update from Outlook."
                  : filesQuotation
                    ? "The call goes on the lead; the quotation is submitted as one first if it isn't yet."
                    : "The call goes on the lead, and sets its next step."}
              </p>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" busy={busy}>
                {busy ? null : moving ? <CalendarClock size={15} aria-hidden /> : <Send size={15} aria-hidden />}
                {moving ? "Move the call" : "Send invite"}
              </Button>
            </footer>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
