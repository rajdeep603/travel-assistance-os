"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Bot, User } from "lucide-react";
import { Card, EmptyState, ErrorBanner, KeyValue, PageHeader, SectionTitle, SkeletonRows, StatusBadge } from "@/components/ui";
import { formatDateTime, formatEndReason, formatEnum } from "@/lib/format";

interface CallDetail {
  id: string;
  ref: string;
  direction: string;
  channel: string;
  agentLabel: string;
  status: string;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  fromNumber: string | null;
  toNumber: string | null;
  summary: string | null;
  transferredTo: string | null;
  placedBy: string | null;
  outcome: Record<string, unknown> | null;
  case: { id: string; ref: string; title: string; status: string; priority: string } | null;
  conversation: { messages: { role: "user" | "agent"; text: string; at: string }[] } | null;
}

/** Outcome keys worth showing, in a readable form. */
function outcomeRows(outcome: Record<string, unknown> | null): [string, string][] {
  if (!outcome) return [];
  const rows: [string, string][] = [];
  if (outcome.appointmentRef) rows.push(["Appointment", String(outcome.appointmentRef)]);
  if (outcome.caseRef) rows.push(["Case", String(outcome.caseRef)]);
  const handoff = outcome.handoff as { target?: string; reason?: string } | undefined;
  if (handoff?.target) rows.push(["Handoff", `${formatEnum(handoff.target)} — ${handoff.reason ?? ""}`]);
  if (outcome.transferFailed) rows.push(["Transfer", `Not answered (${String(outcome.transferFailed)})`]);
  const coverage = outcome.coverageChecked as { policy?: string; benefit?: string } | undefined;
  if (coverage?.policy) rows.push(["Coverage checked", `${coverage.policy}${coverage.benefit ? ` · ${formatEnum(coverage.benefit)}` : ""}`]);
  if (outcome.endReason) rows.push(["Ended", formatEndReason(String(outcome.endReason))]);
  return rows;
}

export default function CallDetailPage({ params }: { params: { id: string } }) {
  const [call, setCall] = useState<CallDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/calls/${encodeURIComponent(params.id)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error?.message ?? "The call could not be loaded.");
        return r.json();
      })
      .then((b) => setCall(b.call))
      .catch((e: Error) => setError(e.message));
  }, [params.id]);

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <ErrorBanner message={error} />
        <Link href="/calls" className="text-sm font-medium text-blue-600 hover:underline">
          ← Back to the Call Center
        </Link>
      </div>
    );
  }
  if (!call) {
    return (
      <div className="mx-auto max-w-7xl">
        <SkeletonRows rows={6} />
      </div>
    );
  }

  const messages = call.conversation?.messages ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/calls" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-blue-600">
        <ArrowLeft size={14} aria-hidden /> Call Center
      </Link>
      <PageHeader title={`${call.ref} — ${call.agentLabel}`} subtitle={`${formatEnum(call.direction)} ${call.channel === "PHONE" ? "phone call" : "web voice session"}`}>
        <StatusBadge value={call.status} />
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <SectionTitle>AI summary</SectionTitle>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{call.summary ?? "No summary (the call may still be in progress)."}</p>
          </Card>
          <Card>
            <SectionTitle>Transcript</SectionTitle>
            {messages.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No transcript" hint="Phone transcripts are erased after the retention period." />
              </div>
            ) : (
              <div className="mt-3 space-y-2.5" role="log" aria-label="Call transcript">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`flex max-w-[85%] items-start gap-2 rounded-2xl px-3.5 py-2 text-sm ${
                        m.role === "user" ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-slate-100 text-slate-800"
                      }`}
                    >
                      {m.role === "user" ? <User size={14} className="mt-0.5 shrink-0 text-blue-200" aria-hidden /> : <Bot size={14} className="mt-0.5 shrink-0 text-blue-500" aria-hidden />}
                      <span>{m.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <SectionTitle>Call details</SectionTitle>
            {/* Side by side when the card spans the page (portrait tablets); stacked in the side column. */}
            <dl className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-1">
              <KeyValue label="Started" value={formatDateTime(call.startedAt)} />
              <KeyValue label="Ended" value={call.endedAt ? formatDateTime(call.endedAt) : null} />
              <KeyValue label="Length" value={call.durationSec != null ? `${Math.floor(call.durationSec / 60)}m ${call.durationSec % 60}s` : null} />
              <KeyValue label="Caller" value={call.direction === "INBOUND" ? call.fromNumber : call.toNumber} />
              <KeyValue label="Transferred to" value={call.transferredTo ? formatEnum(call.transferredTo) : null} />
              <KeyValue label="Placed by" value={call.placedBy} />
            </dl>
          </Card>
          <Card>
            <SectionTitle>Outcome</SectionTitle>
            {outcomeRows(call.outcome).length ? (
              <dl className="mt-2">
                {outcomeRows(call.outcome).map(([k, v]) => (
                  <KeyValue key={k} label={k} value={v} />
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No structured outcome recorded.</p>
            )}
          </Card>
          {call.case ? (
            <Card>
              <SectionTitle>Case</SectionTitle>
              <Link href={`/cases/${call.case.id}`} className="mt-2 block text-sm font-semibold text-blue-600 hover:underline">
                {call.case.ref}
              </Link>
              <p className="text-xs text-slate-500">{call.case.title}</p>
              <div className="mt-2 flex gap-2">
                <StatusBadge value={call.case.priority} />
                <StatusBadge value={call.case.status} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
