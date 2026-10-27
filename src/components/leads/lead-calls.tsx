"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, ExternalLink, Video, X } from "lucide-react";
import { Button, Card, ErrorBanner, SectionTitle, readApiError } from "@/components/ui";
import { ProposeCall, type CallRecord, type LeadAfterCall } from "@/components/leads/propose-call";
import { describeCallSlot } from "@/lib/calls";
import { formatDayTime, formatTime } from "@/lib/format";
import { getDisplayTimeZone } from "@/lib/time-zone";

// The lead's Teams calls: when, who, the link to join, and moving or
// cancelling one (Outlook tells everyone invited). Hidden on a server
// without Microsoft 365 unless calls were booked before.

interface Calls {
  meetings: CallRecord[];
  configured: boolean;
  organizer: string | null;
}

const LINK = "inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-deep";

export function LeadCalls({
  lead,
  onLeadChange,
}: {
  lead: { id: string; ref: string; customerName: string; email: string | null; quoteNumber: string };
  onLeadChange: (lead: LeadAfterCall) => void;
}) {
  const [calls, setCalls] = useState<Calls | null>(null);
  const [panel, setPanel] = useState<{ meeting?: CallRecord } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const viewerZone = getDisplayTimeZone();

  useEffect(() => {
    let live = true;
    fetch(`/api/leads/${lead.id}/meetings`)
      .then((res) => (res.ok ? (res.json() as Promise<Calls>) : null))
      .then((body) => live && body && setCalls(body))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [lead.id]);

  if (!calls || (!calls.configured && !calls.meetings.length)) return null;

  const put = (meeting: CallRecord) =>
    setCalls((c) => c && { ...c, meetings: [...c.meetings.filter((m) => m.id !== meeting.id), meeting].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) });

  async function cancel(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res, "The call couldn't be cancelled. Please try again."));
      const result = (await res.json()) as { meeting: CallRecord; lead: LeadAfterCall };
      put(result.meeting);
      onLeadChange(result.lead);
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The call couldn't be cancelled. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>Teams calls</SectionTitle>
        {calls.configured && calls.organizer ? (
          <Button variant="secondary" onClick={() => setPanel({})}>
            <CalendarPlus size={15} aria-hidden />
            Propose a call
          </Button>
        ) : null}
      </div>
      {error ? (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {calls.meetings.length ? (
        <ul className="mt-3 divide-y divide-line/70">
          {calls.meetings.map((m) => {
            const cancelled = m.status === "CANCELLED";
            const over = Date.parse(m.endsAt) <= now;
            const open = !cancelled && !over;
            return (
              <li key={m.id} className="flex items-start gap-3 py-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${open ? "bg-blue-50 text-blue-600" : "bg-canvas text-muted"}`}>
                  <Video size={17} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold tabular-nums ${open ? "text-ink" : "text-muted"}`}>
                    {formatDayTime(m.startsAt)}–{formatTime(m.endsAt)}
                    {cancelled ? <span className="ms-2 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-line">Cancelled</span> : null}
                    {!cancelled && over ? <span className="ms-2 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-line">Held</span> : null}
                  </p>
                  {m.timeZone !== viewerZone ? <p className="text-xs text-muted">For them: {describeCallSlot(m.startsAt, m.endsAt, m.timeZone)}</p> : null}
                  <p className="mt-0.5 text-xs text-muted [overflow-wrap:anywhere]">{m.attendees.join(", ")}</p>
                  {open ? (
                    confirming === m.id ? (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="text-sm text-red-800">Cancel the call? Everyone invited gets a cancellation from Outlook.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button variant="danger" busy={busy === m.id} onClick={() => void cancel(m.id)}>
                            Cancel the call
                          </Button>
                          <Button variant="secondary" onClick={() => setConfirming(null)}>
                            Keep it
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {m.joinUrl ? (
                          <a href={m.joinUrl} target="_blank" rel="noreferrer" className={LINK}>
                            <Video size={14} aria-hidden />
                            Join in Teams
                          </a>
                        ) : null}
                        {m.webLink ? (
                          <a href={m.webLink} target="_blank" rel="noreferrer" className={LINK}>
                            <ExternalLink size={14} aria-hidden />
                            Open in Outlook
                          </a>
                        ) : null}
                        {calls.configured ? (
                          <>
                            <button type="button" onClick={() => setPanel({ meeting: m })} className={LINK}>
                              <CalendarClock size={14} aria-hidden />
                              Move
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirming(m.id)}
                              className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted transition-colors duration-150 hover:text-red-700"
                            >
                              <X size={14} aria-hidden />
                              Cancel
                            </button>
                          </>
                        ) : null}
                      </div>
                    )
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">
          No call booked yet. Invites come with a Teams link, from <bdi className="[overflow-wrap:anywhere]">{calls.organizer}</bdi>.
        </p>
      )}

      {panel && calls.organizer ? (
        <ProposeCall
          organizer={calls.organizer}
          customerName={lead.customerName}
          email={lead.email ?? ""}
          quoteNumber={lead.quoteNumber || null}
          fileLead={async () => ({ id: lead.id, ref: lead.ref })}
          meeting={panel.meeting}
          onBooked={({ meeting, lead: after }) => {
            put(meeting);
            onLeadChange(after);
          }}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </Card>
  );
}
