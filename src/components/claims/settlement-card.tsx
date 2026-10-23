"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileCheck2, XCircle } from "lucide-react";
import { Button, Card, ErrorBanner, SectionTitle, Skeleton, readApiError } from "@/components/ui";
import { formatMoneyExact } from "@/lib/format";
import { useT } from "@/components/i18n";

interface Settlement {
  currency: string;
  billed: number;
  notCovered: number;
  aboveReference: number;
  allowed: number;
  excess: number;
  overLimit: number;
  payable: number;
  travellerPays: number;
  benefit: { label: string };
  policy: { number: string; plan: string; currency: string; remaining: number } | null;
  reasons: string[];
  checks: { label: string; ok: boolean }[];
  attention: string[];
  balanceBillingRisk: number;
  approvedBy?: string;
  approvedAt?: string;
}

/**
 * The claim's settlement: the waterfall from billed to what the plan pays,
 * the checks behind it and what needs a person. Approving issues the
 * explanation of benefits; afterwards the card shows what was approved.
 */
export function SettlementCard({
  claimId,
  settled,
  eobDocumentId,
  onSettled,
}: {
  claimId: string;
  settled: Settlement | null;
  eobDocumentId: string | null;
  onSettled: () => void;
}) {
  const [recommended, setRecommended] = useState<Settlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useT();

  const load = useCallback(async () => {
    if (settled) return;
    try {
      const res = await fetch(`/api/claims/${claimId}/settlement`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res, "The settlement could not be worked out."));
      setRecommended((await res.json()).settlement);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The settlement could not be worked out.");
    }
  }, [claimId, settled]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claimId}/settlement`, { method: "POST" });
      if (!res.ok) throw new Error(await readApiError(res, "The settlement could not be approved."));
      onSettled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The settlement could not be approved.");
    } finally {
      setBusy(false);
    }
  }

  const s = settled ?? recommended;
  const m = (n: number) => formatMoneyExact(n, s?.currency ?? "EUR");
  const rows: [string, number, "minus" | "total"][] = s
    ? [
        [t("Billed"), s.billed, "total"],
        [t("Never covered"), s.notCovered, "minus"],
        [t("Above reference or network price"), s.aboveReference, "minus"],
        [`${t("Allowed under")} ${t(s.benefit.label).toLowerCase()}`, s.allowed, "total"],
        [t("Excess"), s.excess, "minus"],
        ...(s.overLimit > 0 ? ([[t("Above the remaining limit"), s.overLimit, "minus"]] as [string, number, "minus"][]) : []),
      ]
    : [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>{settled ? "Settlement approved" : "Recommended settlement"}</SectionTitle>
        <span className="text-xs text-muted">{t("Rules recommend · a person approves")}</span>
      </div>
      {error ? <div className="mt-3"><ErrorBanner message={error} /></div> : null}
      {!s ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          <dl className="mt-3 divide-y divide-line/60 text-sm">
            {rows.map(([label, value, kind]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className={kind === "total" ? "font-medium text-ink" : "text-muted"}>{label}</dt>
                <dd className={`tabular-nums ${kind === "total" ? "font-medium text-ink" : value > 0 ? "text-warn" : "text-muted"}`}>
                  {kind === "minus" && value > 0 ? "−" : ""}
                  {m(value)}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-brand/[0.06] px-4 py-3">
              <p className="text-xs font-medium text-muted">{t("The plan pays")}</p>
              <p className="text-2xl font-semibold tabular-nums text-brand">{m(s.payable)}</p>
            </div>
            <div className="rounded-xl bg-canvas px-4 py-3">
              <p className="text-xs font-medium text-muted">{t("The traveller pays")}</p>
              <p className="text-2xl font-semibold tabular-nums text-ink">{m(s.travellerPays)}</p>
            </div>
          </div>

          <ul className="mt-4 space-y-1 text-sm">
            {s.checks.map((c) => (
              <li key={c.label} className="flex gap-2">
                {c.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden /> : <XCircle size={15} className="mt-0.5 shrink-0 text-red-500" aria-hidden />}
                <span className={c.ok ? "text-ink/80" : "text-red-700"}>{c.label}</span>
              </li>
            ))}
          </ul>
          {!settled && s.attention.length ? (
            <ul className="mt-3 space-y-1 rounded-lg border border-warn/30 bg-warn/[0.07] px-3 py-2 text-sm text-ink/80">
              {s.attention.map((a) => (
                <li key={a} className="flex gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden /> {a}
                </li>
              ))}
            </ul>
          ) : null}
          <details className="mt-3 text-sm text-muted">
            <summary className="cursor-pointer font-medium text-ink/80">{t("How it was worked out")}</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {s.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </details>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {settled ? (
              <>
                {eobDocumentId ? (
                  <a
                    href={`/api/documents/${eobDocumentId}/file`}
                    className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink shadow-sm hover:bg-canvas"
                  >
                    <Download size={15} aria-hidden /> {t("Explanation of benefits (PDF)")}
                  </a>
                ) : null}
                <span className="text-xs text-muted">Approved by {settled.approvedBy ?? "a person"}</span>
              </>
            ) : (
              <Button onClick={approve} busy={busy}>
                <FileCheck2 size={15} aria-hidden /> {t("Approve settlement and issue the EOB")}
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
