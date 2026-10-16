"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarPlus, FilePlus2, ReceiptText } from "lucide-react";
import {
  Card,
  EmptyState,
  ErrorBanner,
  KeyValue,
  PageHeader,
  SectionTitle,
  Skeleton,
  SkeletonRows,
  StatusBadge,
  STATUS_DOTS,
  Timeline,
  readApiError,
} from "@/components/ui";
import type { TimelineItem } from "@/components/ui";
import { InterpreterCard } from "@/components/calls/interpreter-card";
import { GuaranteeLettersCard } from "@/components/cases/guarantee-letters-card";
import { BillReviewCard, type BillReview } from "@/components/bill-review-card";
import { MoneyCard } from "@/components/cases/money-card";
import type { CaseMoney } from "@/lib/services/exposure";
import { PlaceCallCard } from "@/components/calls/place-call-card";
import { formatActor, formatDateTime, formatEnum } from "@/lib/format";

interface CaseDetail {
  id: string;
  ref: string;
  title: string;
  description: string;
  location: string;
  country: string;
  assistanceType: string;
  priority: string;
  status: string;
  symptoms: string[];
  aiSummary: string | null;
  suggestedActions: string[] | null;
  assignedTo: string | null;
  createdAt: string;
  patient: {
    ref: string;
    firstName: string;
    lastName: string;
    nationality: string;
    language: string;
    phone: string;
    policyNumber: string;
  };
  appointments: {
    id: string;
    ref: string;
    scheduledAt: string;
    status: string;
    reason: string;
    provider: { name: string; facility: string; district: string };
  }[];
  claims: { id: string; ref: string; status: string; signals: { code: string; reason: string }[] | null }[];
  documents: {
    id: string;
    filename: string;
    kind: string;
    status: string;
    extraction: { documentNumber: string | null } | null;
    billReview: BillReview | null;
  }[];
  conversations: { id: string; channel: string; summary: string | null }[];
  money: CaseMoney | null;
  calls: {
    id: string;
    ref: string;
    channel: string;
    direction: string;
    status: string;
    startedAt: string;
    durationSec: number | null;
    summary: string | null;
  }[];
  events: { id: string; type: string; title: string; body: string | null; actor: string | null; createdAt: string }[];
}

const EVENT_DOTS: Record<string, string> = {
  CALL: "bg-sky-500",
  APPOINTMENT: "bg-emerald-500",
  NOTE: "bg-slate-400",
  EMAIL: "bg-indigo-500",
  FAX: "bg-indigo-500",
  LETTER_OF_GUARANTEE: "bg-violet-500",
  BILL_REVIEW: "bg-brand",
  STATUS: "bg-blue-500",
  DOCUMENT: "bg-indigo-400",
  CLAIM: "bg-indigo-500",
};

const STATUSES = ["NEW", "IN_PROGRESS", "PENDING_INFO", "ESCALATED", "RESOLVED", "CLOSED"];

/** The case journey: intake → conversations → appointments → claims → people. */
function buildJourney(data: CaseDetail): TimelineItem[] {
  const items: TimelineItem[] = [
    {
      title: "Assistance request received",
      meta: `${data.aiSummary ? "Analysed by AI" : "Logged"} — ${formatEnum(data.assistanceType)}, priority ${formatEnum(data.priority)}`,
      time: formatDateTime(data.createdAt),
      dotClass: "bg-blue-500",
    },
  ];
  // Everything recorded on the case timeline (calls, bookings, notes, letters…).
  for (const e of data.events ?? []) {
    const by = formatActor(e.actor);
    items.push({
      title: e.title,
      meta: [e.body, by ? `— ${by}` : null].filter(Boolean).join(" ") || undefined,
      time: formatDateTime(e.createdAt),
      dotClass: EVENT_DOTS[e.type] ?? "bg-slate-400",
    });
  }
  for (const a of data.appointments) {
    // Bookings made by voice agents are already on the timeline as events.
    if ((data.events ?? []).some((e) => e.type === "APPOINTMENT" && e.title.includes(a.ref))) continue;
    items.push({
      title: `Appointment ${a.ref} — ${a.provider.name}`,
      meta: `${a.provider.facility}, ${a.provider.district} · ${formatEnum(a.status)}`,
      time: formatDateTime(a.scheduledAt),
      dotClass: STATUS_DOTS[a.status] ?? "bg-emerald-500",
    });
  }
  for (const c of data.claims) {
    items.push({
      title: `Claim ${c.ref}`,
      meta: formatEnum(c.status),
      dotClass: STATUS_DOTS[c.status] ?? "bg-indigo-500",
    });
  }
  items.push(
    data.assignedTo
      ? {
          title: `Human case manager in charge: ${data.assignedTo}`,
          meta: "AI prepares, people decide",
          dotClass: "bg-slate-700",
        }
      : {
          title: "Awaiting case manager assignment",
          dotClass: "bg-slate-300",
        }
  );
  return items;
}

export default function CaseDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${params.id}`);
      if (!res.ok) {
        setError(await readApiError(res, "This case could not be loaded."));
        return;
      }
      setData((await res.json()).case);
    } catch {
      setError("The case could not be loaded — please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(status: string) {
    if (!data) return;
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The status could not be updated."));
        return;
      }
      await load();
    } catch {
      setError("The status could not be updated — please try again.");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl" role="status" aria-label="Loading">
        <Skeleton className="mb-4 h-4 w-24" />
        <Skeleton className="mb-6 h-8 w-80" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card><SkeletonRows rows={3} /></Card>
            <Card><SkeletonRows rows={4} /></Card>
          </div>
          <div className="space-y-5">
            <Card><SkeletonRows rows={5} /></Card>
          </div>
        </div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <ErrorBanner message={error} />
        <Link href="/cases" className="text-sm font-medium text-blue-600 hover:underline">
          ← Back to cases
        </Link>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href="/cases"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-blue-600"
      >
        <ArrowLeft size={14} /> All cases
      </Link>
      <PageHeader title={`${data.ref} — ${data.title}`} subtitle={data.location}>
        <div className="flex items-center gap-2">
          <StatusBadge value={data.priority} />
          <StatusBadge value={data.status} />
        </div>
      </PageHeader>
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card>
            <SectionTitle>AI summary</SectionTitle>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {data.aiSummary ?? "No AI summary recorded."}
            </p>
            <SectionTitle className="mt-4">Original request</SectionTitle>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-500">
              {data.description}
            </p>
          </Card>

          <Card>
            <SectionTitle>Case journey</SectionTitle>
            <div className="mt-3">
              <Timeline items={buildJourney(data)} />
            </div>
          </Card>

          {data.suggestedActions?.length ? (
            <Card>
              <SectionTitle>Suggested actions</SectionTitle>
              <ul className="mt-2 space-y-1.5">
                {data.suggestedActions.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    {a}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <SectionTitle>Appointments</SectionTitle>
            {data.appointments.length === 0 ? (
              <div className="mt-3"><EmptyState title="No appointments linked" /></div>
            ) : (
              <div className="mt-2 divide-y divide-slate-100">
                {data.appointments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {a.ref} · {a.provider.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {a.provider.facility}, {a.provider.district} ·{" "}
                        {formatDateTime(a.scheduledAt)}
                      </p>
                    </div>
                    <StatusBadge value={a.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>Claims &amp; documents</SectionTitle>
            <div className="mt-2 space-y-2">
              {data.claims.length === 0 && data.documents.length === 0 ? (
                <EmptyState title="No claims or documents linked" />
              ) : (
                <>
                  {data.claims.map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-1">
                      <span className="flex items-center gap-2">
                        <Link
                          href={`/claims/${c.ref}`}
                          className="text-sm font-semibold text-blue-600 hover:underline"
                        >
                          {c.ref}
                        </Link>
                        {c.signals?.length ? (
                          <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-ink">
                            {c.signals.length} integrity {c.signals.length === 1 ? "signal" : "signals"}
                          </span>
                        ) : null}
                      </span>
                      <StatusBadge value={c.status} />
                    </div>
                  ))}
                  {data.documents.map((d) => (
                    <div key={d.id} className="flex items-center justify-between py-1">
                      <span className="truncate text-sm text-slate-700">{d.filename}</span>
                      <span className="ml-3 shrink-0 text-xs text-slate-400">
                        {formatEnum(d.kind)}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Card>

          {data.money ? <MoneyCard money={data.money} /> : null}

          {data.documents
            .filter((d) => d.billReview && (d.billReview.savings > 0 || d.billReview.result.guarantee?.exceedsBy))
            .map((d) => (
              <BillReviewCard
                key={d.billReview!.id}
                review={d.billReview!}
                title={d.extraction?.documentNumber ?? d.filename}
                onChanged={() => void load()}
              />
            ))}

          <GuaranteeLettersCard caseId={data.id} onChanged={() => void load()} />

          {data.calls?.length ? (
            <Card>
              <SectionTitle>Voice calls</SectionTitle>
              <div className="mt-2 divide-y divide-slate-100">
                {data.calls.map((c) => (
                  <div key={c.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/calls/${c.id}`} className="text-sm font-semibold text-blue-600 hover:underline">
                        {c.ref} · {c.channel === "PHONE" ? `${formatEnum(c.direction)} phone call` : "Web voice session"}
                      </Link>
                      <StatusBadge value={c.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(c.startedAt)}
                      {c.durationSec != null ? ` · ${Math.floor(c.durationSec / 60)}m ${c.durationSec % 60}s` : ""}
                    </p>
                    {c.summary ? <p className="mt-1 text-sm text-slate-700">{c.summary}</p> : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {data.conversations.length > 0 && !data.calls?.length ? (
            <Card>
              <SectionTitle>Conversations</SectionTitle>
              <div className="mt-2 space-y-2">
                {data.conversations.map((c) => (
                  <div key={c.id} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {formatEnum(c.channel)} interaction
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {c.summary ?? "Transcript stored (no summary)."}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <SectionTitle>Act on this case</SectionTitle>
            <div className="mt-3 grid gap-2">
              {[
                { href: `/providers?caseId=${data.id}`, label: "Book a provider", Icon: CalendarPlus },
                { href: `/documents?caseId=${data.id}`, label: "Add a medical document", Icon: FilePlus2 },
                { href: `/claims?caseId=${data.id}`, label: "Start a claim", Icon: ReceiptText },
              ].map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Icon size={16} className="text-blue-600" aria-hidden />
                  {label}
                </Link>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Everything created from here is linked back to {data.ref}.
            </p>
          </Card>

          <PlaceCallCard caseId={data.id} />
          <InterpreterCard caseId={data.id} />

          <Card>
            <SectionTitle>Case details</SectionTitle>
            <dl className="mt-2">
              <KeyValue label="Case ID" value={data.ref} />
              <KeyValue
                label="Patient"
                value={`${data.patient.firstName} ${data.patient.lastName} (${data.patient.ref})`}
              />
              <KeyValue label="Policy" value={data.patient.policyNumber} />
              <KeyValue label="Nationality" value={data.patient.nationality} />
              <KeyValue label="Language" value={data.patient.language} />
              <KeyValue label="Location" value={`${data.location}, ${data.country}`} />
              <KeyValue
                label="Assistance type"
                value={formatEnum(data.assistanceType)}
              />
              <KeyValue
                label="Symptoms"
                value={data.symptoms.length ? data.symptoms.join(", ") : null}
              />
              <KeyValue label="Assigned case manager" value={data.assignedTo} />
              <KeyValue
                label="Created"
                value={formatDateTime(data.createdAt)}
              />
            </dl>
          </Card>

          <Card>
            <SectionTitle>Update status</SectionTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              {STATUSES.map((s) => {
                const isCurrent = s === data.status;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={updating || isCurrent}
                    onClick={() => setStatus(s)}
                    aria-pressed={isCurrent}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isCurrent
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                    }`}
                  >
                    {formatEnum(s)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Current status is highlighted — click another to move the case.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
