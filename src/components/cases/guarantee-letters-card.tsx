"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileCheck2, FileDown, Send, ShieldCheck } from "lucide-react";
import { Button, Card, ErrorBanner, SectionTitle, StatusBadge, readApiError } from "@/components/ui";
import { formatActor, formatMoney } from "@/lib/format";
import { describeGuaranteeDecision } from "@/lib/guarantee-trace";
import { formatPlainDate } from "@/lib/time";

interface Letter {
  id: string;
  ref: string;
  status: "DRAFT" | "APPROVED" | "SENT" | "ACKNOWLEDGED" | "REJECTED";
  hospitalName: string;
  estimatedAmount: number;
  guaranteedAmount: number;
  excess: number;
  currency: string;
  conditions: string[];
  flags: string[];
  validUntil: string;
  approvedBy: string | null;
  rejectionReason: string | null;
  pdfDocumentId: string | null;
  sentVia: string | null;
  sentTo: string | null;
  decisionTrace: Record<string, unknown>;
}

interface Estimate {
  id: string;
  filename: string;
  extraction: { invoiceAmount: number | null; currency: string | null; hospital: string | null } | null;
}

/** Letters of Guarantee on a case: draft from a cost estimate, decide, send, confirm. */
export function GuaranteeLettersCard({ caseId, onChanged }: { caseId: string; onChanged?: () => void }) {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  // Approval above what the policy can still guarantee needs a reason.
  const [overrides, setOverrides] = useState<Record<string, { message: string; reason: string }>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/guarantee-letters?caseId=${encodeURIComponent(caseId)}`);
    if (!res.ok) return;
    const body = await res.json();
    setLetters(body.letters);
    setEstimates(body.pendingEstimates);
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(key: string, url: string, body: unknown = {}) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        setError(await readApiError(res, "That didn't work — please try again."));
        return;
      }
      await load();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  async function approve(id: string) {
    const key = `approve-${id}`;
    setBusy(key);
    setError(null);
    try {
      const reason = overrides[id]?.reason.trim();
      const res = await fetch(`/api/guarantee-letters/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(amounts[id] ? { amount: Number(amounts[id]) } : {}), ...(reason ? { reason } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.error?.code === "REASON_REQUIRED") {
          setOverrides((o) => ({ ...o, [id]: { message: body.error.message, reason: o[id]?.reason ?? "" } }));
        } else {
          setError(body?.error?.message ?? "That didn't work — please try again.");
        }
        return;
      }
      setOverrides((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
      await load();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  if (letters.length === 0 && estimates.length === 0) return null;

  return (
    <Card>
      <SectionTitle>Letters of Guarantee</SectionTitle>
      {error ? (
        <div className="mt-2">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {estimates.map((e) => (
        <div key={e.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            Cost estimate {e.extraction?.hospital ? `from ${e.extraction.hospital} ` : ""}
            {e.extraction?.invoiceAmount != null ? `for ${formatMoney(e.extraction.invoiceAmount, e.extraction.currency)} ` : ""}
            is waiting for a guarantee.
          </p>
          <Button busy={busy === `create-${e.id}`} onClick={() => void act(`create-${e.id}`, "/api/guarantee-letters", { documentId: e.id, caseId })}>
            <ShieldCheck size={14} aria-hidden /> Prepare letter
          </Button>
        </div>
      ))}

      <div className="mt-3 space-y-3">
        {letters.map((l) => (
          <div key={l.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <FileCheck2 size={15} className="text-violet-600" aria-hidden /> {l.ref} · {l.hospitalName}
              </p>
              <StatusBadge value={l.status} />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Estimate</dt>
                <dd className="text-slate-800">{formatMoney(l.estimatedAmount, l.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Guaranteed</dt>
                <dd className="font-semibold text-slate-900">{formatMoney(l.guaranteedAmount, l.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Patient excess</dt>
                <dd className="text-slate-800">{formatMoney(l.excess, l.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Valid until</dt>
                <dd className="text-slate-800">{formatPlainDate(l.validUntil.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</dd>
              </div>
            </dl>
            {l.flags.length ? (
              <ul className="mt-2 space-y-1">
                {l.flags.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-amber-800">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> {f}
                  </li>
                ))}
              </ul>
            ) : null}
            {l.approvedBy ? (
              <p className="mt-2 text-xs text-slate-500">
                {l.status === "REJECTED" ? `Declined by ${formatActor(l.approvedBy)}: ${l.rejectionReason}` : `Approved by ${formatActor(l.approvedBy)}`}
                {l.sentVia ? ` · sent by ${l.sentVia.toLowerCase()} to ${l.sentTo}` : ""}
              </p>
            ) : null}
            <details className="mt-2 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700">How the amount was decided, and conditions</summary>
              <p className="mt-2 font-medium text-slate-700">How the amount was decided</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                {describeGuaranteeDecision(l.decisionTrace, l.flags).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="mt-2 font-medium text-slate-700">Conditions</p>
              <ul className="mt-1 list-disc pl-5">
                {l.conditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </details>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {l.pdfDocumentId ? (
                <a
                  href={`/api/documents/${l.pdfDocumentId}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <FileDown size={14} aria-hidden /> Letter PDF
                </a>
              ) : null}
              {l.status === "DRAFT" ? (
                <>
                  <input
                    aria-label={`Guaranteed amount for ${l.ref}`}
                    inputMode="decimal"
                    placeholder={String(l.guaranteedAmount)}
                    value={amounts[l.id] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [l.id]: e.target.value }))}
                    className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <Button
                    busy={busy === `approve-${l.id}`}
                    disabled={overrides[l.id] != null && overrides[l.id].reason.trim().length < 3}
                    onClick={() => void approve(l.id)}
                  >
                    {overrides[l.id] ? "Approve with reason" : "Approve"}
                  </Button>
                  <input
                    aria-label={`Reason to decline ${l.ref}`}
                    placeholder="Reason to decline"
                    value={reasons[l.id] ?? ""}
                    onChange={(e) => setReasons((r) => ({ ...r, [l.id]: e.target.value }))}
                    className="w-44 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <Button
                    variant="danger"
                    busy={busy === `reject-${l.id}`}
                    disabled={(reasons[l.id] ?? "").trim().length < 3}
                    onClick={() => void act(`reject-${l.id}`, `/api/guarantee-letters/${l.id}/reject`, { reason: reasons[l.id] })}
                  >
                    Decline
                  </Button>
                </>
              ) : null}
              {l.status === "DRAFT" && overrides[l.id] ? (
                <div className="w-full rounded-lg border border-warn/40 bg-warn/10 p-3">
                  <p className="text-sm text-ink">{overrides[l.id].message}</p>
                  <input
                    aria-label={`Reason to approve ${l.ref} above the limit`}
                    placeholder="Reason, e.g. senior desk approved a top-up"
                    value={overrides[l.id].reason}
                    onChange={(e) => setOverrides((o) => ({ ...o, [l.id]: { ...o[l.id], reason: e.target.value } }))}
                    className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
                  />
                </div>
              ) : null}
              {l.status === "APPROVED" ? (
                <Button busy={busy === `send-${l.id}`} onClick={() => void act(`send-${l.id}`, `/api/guarantee-letters/${l.id}/send`)}>
                  <Send size={14} aria-hidden /> Send to hospital
                </Button>
              ) : null}
              {l.status === "SENT" ? (
                <Button variant="secondary" busy={busy === `ack-${l.id}`} onClick={() => void act(`ack-${l.id}`, `/api/guarantee-letters/${l.id}/acknowledge`)}>
                  Hospital confirmed receipt
                </Button>
              ) : null}
              {l.status === "SENT" || l.status === "ACKNOWLEDGED" ? (
                <Button variant="secondary" busy={busy === `resend-${l.id}`} onClick={() => void act(`resend-${l.id}`, `/api/guarantee-letters/${l.id}/resend`)}>
                  <Send size={14} aria-hidden /> Re-send
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
