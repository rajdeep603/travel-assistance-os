"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarClock, CalendarPlus, CheckCircle2, Copy, ExternalLink, FileText, Mail, Send, Video, X } from "lucide-react";
import { Button, ErrorBanner, readApiError } from "@/components/ui";
import { CALL_MINUTES, DEFAULT_CALL_MINUTES, MAX_CALL_ATTENDEES, describeCallSlot, defaultCallSlot, sendDraft, type Mentioned, type SendParts } from "@/lib/calls";
import { formatDate } from "@/lib/format";
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

// Send to the customer, in one e-mail: the quotation, a Teams call invite, or
// both (one at least). With the invite, Microsoft 365 creates the call in the
// organiser's Outlook calendar and the invitation goes from there, the
// quotation's PDF attached to it; the quotation alone goes by e-mail. Nothing
// goes before the presenter confirms they agreed to hear from us (GDPR), unless
// the lead already said so. The same panel moves a booked call to another time.

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
  withQuotation: boolean;
  status: "SCHEDULED" | "CANCELLED";
  createdBy: string | null;
}

/** What booking or moving a call changed on the lead. */
export interface LeadAfterCall {
  status: string;
  nextStep: string | null;
  nextStepOn: string | null;
  contactConsentAt: string | null;
  contactConsentBy: string | null;
}

/** They agreed to hear from us by e-mail: when, and who recorded it ("visitor": on the QR page). */
export interface ContactConsent {
  at: string;
  by: string | null;
}

type Availability = "free" | "busy" | "unknown";
type Done = { kind: "invite"; meeting: CallRecord } | { kind: "quotation"; to: string[] };

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
  title,
  organizer,
  customerName,
  companyName = "",
  email,
  quoteNumber,
  mentioned,
  consent = null,
  initial = { quotation: false, invite: true },
  emailQuotation,
  fileLead,
  filesQuotation = false,
  meeting,
  onBooked,
  onEmailed,
  onClose,
}: {
  title: string;
  /** The mailbox Teams invites come from; null when this server can't send them. */
  organizer: string | null;
  customerName: string;
  companyName?: string;
  email: string;
  /** The quotation that can go too; null when there is none yet. */
  quoteNumber: string | null;
  /** What they told us, for a personal first line. */
  mentioned?: Mentioned;
  /** Already given (the QR page, an earlier send): no need to ask again. */
  consent?: ContactConsent | null;
  /** What is ticked when the panel opens. */
  initial?: SendParts;
  /** The quotation alone, by e-mail; absent where that isn't offered (the invite is then needed). Returns who it reached. */
  emailQuotation?: (p: { to: string[]; subject: string; message: string }) => Promise<string[]>;
  /** The lead the call goes on; from the quotation, this files the quotation first. */
  fileLead: () => Promise<{ id: string; ref: string }>;
  /** Opened from the quotation, which is filed as a lead on the way if it isn't yet. */
  filesQuotation?: boolean;
  /** A booked call to move, instead of sending anything new. */
  meeting?: CallRecord;
  /** `filed` is the lead the call went on, when it was filed on the way (from the quotation). */
  onBooked: (result: { meeting: CallRecord; lead: LeadAfterCall; filed: { id: string; ref: string } | null }) => void;
  onEmailed?: (to: string[]) => void;
  onClose: () => void;
}) {
  const moving = Boolean(meeting);
  const canInvite = Boolean(organizer);
  const canQuote = Boolean(quoteNumber);
  const canQuoteAlone = canQuote && Boolean(emailQuotation);
  const [parts, setParts] = useState<SendParts>(() => {
    const p = { quotation: initial.quotation && canQuote, invite: initial.invite && canInvite };
    return p.quotation || p.invite ? p : { quotation: canQuoteAlone, invite: !canQuoteAlone };
  });

  const viewerZone = getDisplayTimeZone();
  const [timeZone, setTimeZone] = useState(() => meeting?.timeZone ?? viewerZone);
  const [slot, setSlot] = useState(() => (meeting ? utcToWallClock(new Date(meeting.startsAt), meeting.timeZone) : defaultCallSlot(viewerZone)));
  const [minutes, setMinutes] = useState<number>(() =>
    meeting ? Math.round((Date.parse(meeting.endsAt) - Date.parse(meeting.startsAt)) / 60_000) : DEFAULT_CALL_MINUTES
  );
  const draft = useMemo(() => sendDraft({ customerName, companyName, quoteNumber, mentioned, ...parts }), [customerName, companyName, quoteNumber, mentioned, parts]);
  const [agreed, setAgreed] = useState(false);
  const [to, setTo] = useState(email);
  const [others, setOthers] = useState("");
  // The text follows what is ticked until the presenter writes their own.
  const [subject, setSubject] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | "checking" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
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

  const withCall = moving || parts.invite;
  const startsAt = useMemo(() => wallClockToUtc(slot.date, slot.time, timeZone), [slot, timeZone]);
  const valid = !Number.isNaN(startsAt.getTime());
  const inPast = valid && startsAt.getTime() < Date.now() + 60_000;
  const viewerTime = valid && timeZone !== viewerZone ? utcToWallClock(startsAt, viewerZone) : null;
  const today = useMemo(() => utcToWallClock(new Date(), timeZone).date, [timeZone]);

  // A quiet look at the organiser's calendar once the time settles.
  useEffect(() => {
    if (!withCall || !valid || inPast) {
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
  }, [slot.date, slot.time, timeZone, minutes, valid, inPast, withCall]);

  const zones = useMemo(
    () => (TIME_ZONES.some((z) => z.id === timeZone) || !isTimeZone(timeZone) ? TIME_ZONES : [...TIME_ZONES, { id: timeZone, label: timeZoneLabel(timeZone), region: "UTC" as const }]),
    [timeZone]
  );

  // One of the two always stays ticked; the quotation stands alone only where it can go by e-mail.
  const locked = { quotation: parts.quotation && !parts.invite, invite: parts.invite && !(parts.quotation && canQuoteAlone) };
  const toggle = (part: keyof SendParts) => {
    if (locked[part] && parts[part]) return;
    setParts((p) => ({ ...p, [part]: !p[part] }));
    setError(null);
  };

  async function send() {
    setError(null);
    if (withCall && !valid) return setError("Pick a day and a start time.");
    if (withCall && inPast) return setError("That time has already passed. Pick a later one.");
    const body = { date: slot.date, time: slot.time, timeZone, minutes };
    const recipients = [...new Set([...splitAddresses(to), ...splitAddresses(others)])];
    const text = { subject: (subject ?? draft.subject).trim(), message: (message ?? draft.message).trim() };
    if (!moving) {
      if (!splitAddresses(to).length) return setError("Enter the customer's e-mail address.");
      const wrong = recipients.find((a) => !looksLikeEmail(a));
      if (wrong) return setError(`${wrong} isn't an e-mail address.`);
      if (recipients.length > MAX_CALL_ATTENDEES) return setError(`Send to at most ${MAX_CALL_ATTENDEES} people.`);
      if (!text.subject) return setError("Enter a subject.");
      if (!consent && !agreed) return setError("Ask them first, then tick that they agreed to hear from us.");
    }
    setBusy(true);
    try {
      if (meeting) {
        const res = await fetch(`/api/meetings/${meeting.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(await readApiError(res, "The call couldn't be moved. Please try again."));
        const result = (await res.json()) as { meeting: CallRecord; lead: LeadAfterCall };
        setDone({ kind: "invite", meeting: result.meeting });
        onBooked({ ...result, filed: null });
      } else if (parts.invite) {
        const filed = await fileLead();
        const res = await fetch(`/api/leads/${filed.id}/meetings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, attendees: recipients, ...text, attachQuotation: parts.quotation, consent: agreed }),
        });
        if (!res.ok) throw new Error(await readApiError(res, "The invite couldn't be sent. Please try again."));
        const result = (await res.json()) as { meeting: CallRecord; lead: LeadAfterCall };
        setDone({ kind: "invite", meeting: result.meeting });
        onBooked({ ...result, filed: filesQuotation ? filed : null });
      } else if (emailQuotation) {
        const reached = await emailQuotation({ to: recipients, ...text });
        setDone({ kind: "quotation", to: reached });
        onEmailed?.(reached);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nothing was sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(joinUrl: string) {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard refused (an old browser, no permission): the link is in the invite anyway.
    }
  }

  const tile = (part: keyof SendParts, icon: ReactNode, label: string, detail: ReactNode) => (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors duration-150 ${
        parts[part] ? "border-brand/50 bg-brand/[0.05]" : "border-line bg-surface hover:bg-canvas"
      } ${locked[part] && parts[part] ? "cursor-default" : ""}`}
    >
      <input
        type="checkbox"
        checked={parts[part]}
        onChange={() => toggle(part)}
        aria-disabled={locked[part] && parts[part] ? true : undefined}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {icon}
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-muted [overflow-wrap:anywhere]">{detail}</span>
      </span>
    </label>
  );

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
            {moving ? <CalendarClock size={18} aria-hidden /> : parts.invite ? <CalendarPlus size={18} aria-hidden /> : <Mail size={18} aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            <p className="text-xs text-muted [overflow-wrap:anywhere]">
              {organizer ? (
                <>
                  Teams invites from <bdi>{organizer}</bdi>
                </>
              ) : (
                "By e-mail, with the PDF attached"
              )}
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
                {done.kind === "quotation"
                  ? `Quotation ${quoteNumber} sent, with the PDF attached.`
                  : moving
                    ? "Moved. Everyone invited gets the new time from Outlook."
                    : done.meeting.withQuotation
                      ? "Sent: one e-mail with the Teams invitation and the quotation attached. The call is in your Outlook calendar."
                      : "Invite sent. The call is in your Outlook calendar, with a Teams link."}
              </span>
            </p>
            {done.kind === "invite" ? (
              <div className="rounded-xl bg-canvas p-4 ring-1 ring-line">
                <p className="text-sm font-semibold text-ink">{describeCallSlot(done.meeting.startsAt, done.meeting.endsAt, done.meeting.timeZone)}</p>
                {done.meeting.timeZone !== viewerZone ? <p className="mt-0.5 text-xs text-muted">{describeCallSlot(done.meeting.startsAt, done.meeting.endsAt, viewerZone)}</p> : null}
                <p className="mt-2 text-xs text-muted [overflow-wrap:anywhere]">{done.meeting.attendees.join(", ")}</p>
              </div>
            ) : (
              <p className="rounded-xl bg-canvas p-4 text-xs text-muted ring-1 ring-line [overflow-wrap:anywhere]">{done.to.join(", ")}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {done.kind === "invite" && done.meeting.joinUrl ? (
                <Button variant="secondary" onClick={() => void copyLink(done.meeting.joinUrl!)}>
                  {copied ? <CheckCircle2 size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
                  {copied ? "Copied" : "Copy Teams link"}
                </Button>
              ) : null}
              {done.kind === "invite" && done.meeting.webLink ? (
                <a
                  href={done.meeting.webLink}
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

              {!moving && canQuote && canInvite ? (
                <fieldset className="min-w-0">
                  <legend className="mb-1.5 text-sm font-medium text-slate-700">Send</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {tile("quotation", <FileText size={15} className="text-brand" aria-hidden />, "Quotation", <>{quoteNumber}, PDF attached</>)}
                    {tile("invite", <Video size={15} className="text-brand" aria-hidden />, "Teams call invite", "From your Outlook calendar")}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {parts.quotation && parts.invite ? (
                      <>
                        One e-mail: the Teams invitation with the quotation attached, from <bdi className="[overflow-wrap:anywhere]">{organizer}</bdi>.
                      </>
                    ) : parts.invite ? (
                      canQuoteAlone ? (
                        "The Teams invitation alone."
                      ) : (
                        "The Teams invitation, with the quotation attached if you tick it."
                      )
                    ) : (
                      "The quotation alone, by e-mail with the PDF attached."
                    )}
                  </p>
                </fieldset>
              ) : null}

              {withCall ? (
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
              ) : null}

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
                      <input
                        ref={withCall ? undefined : firstRef}
                        id={ids.to}
                        type="email"
                        autoComplete="off"
                        maxLength={200}
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        placeholder="name@company.com"
                        className={FIELD}
                      />
                    </div>
                    <div>
                      <label htmlFor={ids.others} className={LABEL}>
                        Also send to <span className="text-muted">(optional)</span>
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
                    {consent ? (
                      <p className="flex items-start gap-1.5 text-xs text-emerald-700">
                        <CheckCircle2 size={14} className="mt-px shrink-0" aria-hidden />
                        <span>
                          {consent.by === "visitor" ? "They agreed to hear from us on the QR page" : "They agreed to hear from us"}, {formatDate(consent.at)}.
                        </span>
                      </p>
                    ) : (
                      <label className="flex items-start gap-2.5 rounded-xl border border-line bg-canvas/60 p-3">
                        <input
                          type="checkbox"
                          checked={agreed}
                          onChange={(e) => setAgreed(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink">They agreed to hear from us at these addresses</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            Ask first, e.g. “Is it okay if I send this to your work e-mail?” It is kept on the lead.
                          </span>
                        </span>
                      </label>
                    )}
                  </fieldset>
                  <fieldset className="min-w-0 space-y-3">
                    <legend className="sr-only">The e-mail</legend>
                    <div>
                      <label htmlFor={ids.subject} className={LABEL}>
                        Subject
                      </label>
                      <input id={ids.subject} type="text" maxLength={200} value={subject ?? draft.subject} onChange={(e) => setSubject(e.target.value)} className={FIELD} />
                    </div>
                    <div>
                      <label htmlFor={ids.message} className={LABEL}>
                        Message
                      </label>
                      <textarea
                        id={ids.message}
                        rows={7}
                        maxLength={4000}
                        value={message ?? draft.message}
                        onChange={(e) => setMessage(e.target.value)}
                        className={`${FIELD} leading-relaxed`}
                      />
                      <p className="mt-1 text-xs text-muted">
                        {parts.quotation && parts.invite
                          ? "The quotation's summary follows your text, then the Teams link to join."
                          : parts.invite
                            ? "Teams adds the link to join below it."
                            : "The quotation's summary follows your text."}
                      </p>
                      {subject !== null || message !== null ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSubject(null);
                            setMessage(null);
                          }}
                          className="mt-1 text-xs font-medium text-brand transition-colors duration-150 hover:text-brand-deep"
                        >
                          Use the suggested text
                        </button>
                      ) : null}
                    </div>
                  </fieldset>
                </>
              )}
            </div>

            <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
              <p className="min-w-0 flex-1 text-xs text-muted">
                {moving
                  ? "Everyone invited gets the update from Outlook."
                  : !parts.invite
                    ? "Sent from our e-mail address, one e-mail to each person."
                    : filesQuotation
                      ? "The call goes on the lead; the quotation is submitted as one first if it isn't yet."
                      : "The call goes on the lead, and sets its next step."}
              </p>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" busy={busy}>
                {busy ? null : moving ? <CalendarClock size={15} aria-hidden /> : <Send size={15} aria-hidden />}
                {moving ? "Move the call" : parts.invite && parts.quotation ? "Send" : parts.invite ? "Send invite" : "Send quotation"}
              </Button>
            </footer>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
