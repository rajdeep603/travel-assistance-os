"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileCheck2, FileDown, Send, ShieldCheck } from "lucide-react";
import { Button, Card, ErrorBanner, SectionTitle, StatusBadge, readApiError } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

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
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Estimate</dt>
                <dd className="text-slate-800">{formatMoney(l.estimatedAmount, l.currency)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Guaranteed</dt>
                <dd className="font-semibold text-slate-900">{formatMoney(l.guaranteedAmount, l.currency)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Patient excess</dt>
                <dd className="text-slate-800">{formatMoney(l.excess, l.currency)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Valid until</dt>
                <dd className="text-slate-800">{formatDate(l.validUntil)}</dd>
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
                {l.status === "REJECTED" ? `Declined by ${l.approvedBy}: ${l.rejectionReason}` : `Approved by ${l.approvedBy.replace("system:", "")}`}
                {l.sentVia ? ` · sent by ${l.sentVia.toLowerCase()} to ${l.sentTo}` : ""}
              </p>
            ) : null}
            <details className="mt-2 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700">Conditions and how the amount was decided</summary>
              <ul className="mt-1 list-disc pl-5">
                {l.conditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <pre className="mt-2 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(l.decisionTrace, null, 2)}</pre>
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
                    onClick={() =>
                      void act(`approve-${l.id}`, `/api/guarantee-letters/${l.id}/approve`, amounts[l.id] ? { amount: Number(amounts[l.id]) } : {})
                    }
                  >
                    Approve
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
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
