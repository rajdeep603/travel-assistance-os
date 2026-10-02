"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, MinusCircle, RefreshCw } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  KeyValue,
  PageHeader,
  SectionTitle,
  Skeleton,
  SkeletonRows,
  StatusBadge,
  readApiError,
} from "@/components/ui";
import { Timeline } from "@/components/ui";
import { formatDateTime, formatEnum, formatMoney } from "@/lib/format";

interface Issue {
  severity: "error" | "warning" | "ok";
  message: string;
}

interface HistoryEntry {
  at: string;
  action: string;
  note: string | null;
}

interface ClaimDetail {
  id: string;
  ref: string;
  status: string;
  amount: number | null;
  currency: string | null;
  summary: string | null;
  issues: Issue[] | null;
  history: HistoryEntry[] | null;
  createdAt: string;
  patient: { ref: string; firstName: string; lastName: string; policyNumber: string };
  case: { ref: string } | null;
  documents: {
    id: string;
    filename: string;
    kind: string;
    status: string;
    extraction: {
      diagnosis: string | null;
      hospital: string | null;
      confidence: number | null;
      missingInfo: string[];
    } | null;
  }[];
}

const ISSUE_ICONS = {
  ok: <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />,
  warning: <MinusCircle size={15} className="mt-0.5 shrink-0 text-amber-500" />,
  error: <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-500" />,
};

export default function ClaimDetailPage({ params }: { params: { id: string } }) {
  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/claims/${params.id}`);
      if (!res.ok) {
        setError(await readApiError(res, "This claim could not be loaded."));
        return;
      }
      setClaim((await res.json()).claim);
    } catch {
      setError("The claim could not be loaded — please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function runReview() {
    if (!claim) return;
    setBusy("review");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/claims/${claim.id}/review`, { method: "POST" });
      if (!res.ok) {
        setError(await readApiError(res, "The AI review could not be completed."));
        return;
      }
      setClaim((await res.json()).claim);
      setNotice("AI review completed — completeness and summary refreshed.");
    } catch {
      setError("The AI review failed — please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function act(action: "APPROVE" | "REQUEST_INFO" | "ESCALATE") {
    if (!claim) return;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/claims/${claim.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The action could not be applied."));
        return;
      }
      await load();
      setNotice(
        action === "APPROVE"
          ? "Claim approved."
          : action === "REQUEST_INFO"
            ? "Additional information requested from the traveller."
            : "Claim escalated to a senior claims handler."
      );
    } catch {
      setError("The action could not be applied — please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl" role="status" aria-label="Loading">
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
  if (error && !claim) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <ErrorBanner message={error} />
        <Link href="/claims" className="text-sm font-medium text-blue-600 hover:underline">
          ← Back to claims
        </Link>
      </div>
    );
  }
  if (!claim) return null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/claims"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-blue-600"
      >
        <ArrowLeft size={14} /> All claims
      </Link>
      <PageHeader
        title={`Claim ${claim.ref}`}
        subtitle={`${claim.patient.firstName} ${claim.patient.lastName} · policy ${claim.patient.policyNumber}`}
      >
        <StatusBadge value={claim.status} />
      </PageHeader>
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between">
              <SectionTitle>AI claim summary</SectionTitle>
              <Button
                variant="secondary"
                onClick={runReview}
                busy={busy === "review"}
                className="px-3 py-1.5 text-xs"
              >
                <RefreshCw size={13} />
                Re-run AI review
              </Button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {claim.summary ?? "No AI summary yet — run the AI review."}
            </p>
          </Card>

          <Card>
            <SectionTitle>Completeness check</SectionTitle>
            {!claim.issues || claim.issues.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="Not analysed yet"
                  hint="Run the AI review to check the claim for missing documents."
                />
              </div>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {claim.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    {ISSUE_ICONS[issue.severity]}
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionTitle>Documents</SectionTitle>
            {claim.documents.length === 0 ? (
              <div className="mt-3"><EmptyState title="No documents on this claim" /></div>
            ) : (
              <div className="mt-2 divide-y divide-slate-100">
                {claim.documents.map((d) => (
                  <div key={d.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {d.filename}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatEnum(d.kind)}
                          {d.extraction?.hospital ? ` · ${d.extraction.hospital}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {d.extraction?.confidence != null ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              d.extraction.confidence >= 0.8
                                ? "bg-emerald-50 text-emerald-700"
                                : d.extraction.confidence >= 0.6
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-red-50 text-red-700"
                            }`}
                            title="AI extraction confidence for this document"
                          >
                            {Math.round(d.extraction.confidence * 100)}% confidence
                          </span>
                        ) : null}
                        <StatusBadge value={d.status} />
                      </div>
                    </div>
                    {d.extraction?.missingInfo?.length ? (
                      <p className="mt-1 text-xs text-amber-700">
                        Missing: {d.extraction.missingInfo.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {claim.history?.length ? (
            <Card>
              <SectionTitle>History</SectionTitle>
              <div className="mt-3">
                <Timeline
                  items={[...claim.history].reverse().map((h) => ({
                    title: h.action,
                    meta: h.note ?? undefined,
                    time: formatDateTime(h.at),
                    dotClass: "bg-blue-500",
                  }))}
                />
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <SectionTitle>Claim details</SectionTitle>
            <dl className="mt-2">
              <KeyValue label="Claim" value={claim.ref} />
              <KeyValue
                label="Amount"
                value={
                  claim.amount != null
                    ? formatMoney(Number(claim.amount), claim.currency)
                    : null
                }
              />
              <KeyValue
                label="Linked case"
                value={
                  claim.case ? (
                    <Link
                      href={`/cases/${claim.case.ref}`}
                      className="font-semibold text-blue-600 hover:underline"
                    >
                      {claim.case.ref}
                    </Link>
                  ) : null
                }
              />
              <KeyValue
                label="Submitted"
                value={formatDateTime(claim.createdAt)}
              />
            </dl>
          </Card>

          <Card>
            <SectionTitle>Review actions</SectionTitle>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                variant="success"
                onClick={() => act("APPROVE")}
                busy={busy === "APPROVE"}
                disabled={busy != null}
              >
                Approve
              </Button>
              <Button
                variant="secondary"
                onClick={() => act("REQUEST_INFO")}
                busy={busy === "REQUEST_INFO"}
                disabled={busy != null}
              >
                Request Information
              </Button>
              <Button
                variant="danger"
                onClick={() => act("ESCALATE")}
                busy={busy === "ESCALATE"}
                disabled={busy != null}
              >
                Escalate
              </Button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Actions update the claim state and are recorded in the history —
              the AI prepares, people decide.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
