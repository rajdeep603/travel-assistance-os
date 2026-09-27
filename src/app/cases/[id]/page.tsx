"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  KeyValue,
  PageHeader,
  SectionTitle,
  Spinner,
  StatusBadge,
  readApiError,
} from "@/components/ui";

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
  claims: { id: string; ref: string; status: string }[];
  documents: { id: string; filename: string; kind: string; status: string }[];
  conversations: { id: string; channel: string; summary: string | null }[];
}

const STATUSES = ["NEW", "IN_PROGRESS", "PENDING_INFO", "ESCALATED", "RESOLVED", "CLOSED"];

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
    return <div className="mx-auto max-w-5xl"><Spinner label="Loading case…" /></div>;
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
    <div className="mx-auto max-w-5xl">
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
        <div className="space-y-5 lg:col-span-2">
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
                        {new Date(a.scheduledAt).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
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
                      <Link
                        href={`/claims/${c.ref}`}
                        className="text-sm font-semibold text-blue-600 hover:underline"
                      >
                        {c.ref}
                      </Link>
                      <StatusBadge value={c.status} />
                    </div>
                  ))}
                  {data.documents.map((d) => (
                    <div key={d.id} className="flex items-center justify-between py-1">
                      <span className="truncate text-sm text-slate-700">{d.filename}</span>
                      <span className="ml-3 shrink-0 text-xs text-slate-400">
                        {d.kind.replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Card>

          {data.conversations.length > 0 ? (
            <Card>
              <SectionTitle>Conversations</SectionTitle>
              <div className="mt-2 space-y-2">
                {data.conversations.map((c) => (
                  <div key={c.id} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {c.channel} interaction
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

        <div className="space-y-5">
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
                value={data.assistanceType.replace(/_/g, " ")}
              />
              <KeyValue
                label="Symptoms"
                value={data.symptoms.length ? data.symptoms.join(", ") : null}
              />
              <KeyValue label="Assigned case manager" value={data.assignedTo} />
              <KeyValue
                label="Created"
                value={new Date(data.createdAt).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              />
            </dl>
          </Card>

          <Card>
            <SectionTitle>Update status</SectionTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              {STATUSES.filter((s) => s !== data.status).map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  disabled={updating}
                  onClick={() => setStatus(s)}
                  className="px-3 py-1.5 text-xs"
                >
                  {s.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
