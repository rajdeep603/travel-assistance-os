"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button, Card, ErrorBanner, PageHeader, SectionTitle, SkeletonRows, readApiError } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { useT } from "@/components/i18n";

interface Vendor {
  id: string;
  ref: string;
  name: string;
  country: string;
  cases: number;
  openCases: number;
  critical: number;
  spendEur: number;
  costPerCaseEur: number | null;
  savingsFoundEur: number;
  savingsAcceptedEur: number;
  guarantees: number;
  autoApprovedPct: number | null;
  gopHoursMedian: number | null;
  firstContactPct: number | null;
  sla: { firstResponseMinutes?: number; gopHours?: number } | null;
}

const dash = "—";
const hours = (h: number | null) => (h == null ? dash : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h.toFixed(1)} h`);

/** One row per metric, a column per vendor: the comparison an insurer's claims director reads. */
const METRICS: { label: string; value: (v: Vendor) => string; note?: (v: Vendor) => string | null; warn?: (v: Vendor) => boolean }[] = [
  { label: "Cases", value: (v) => String(v.cases), note: (v) => `${v.openCases} open · ${v.critical} critical` },
  { label: "Medical spend", value: (v) => formatMoney(v.spendEur, "EUR"), note: (v) => (v.costPerCaseEur != null ? `${formatMoney(v.costPerCaseEur, "EUR")} a case` : null) },
  { label: "Savings found by bill review", value: (v) => formatMoney(v.savingsFoundEur, "EUR"), note: (v) => `${formatMoney(v.savingsAcceptedEur, "EUR")} accepted` },
  { label: "Guarantees issued", value: (v) => String(v.guarantees), note: (v) => (v.autoApprovedPct != null ? `${v.autoApprovedPct}% within rules, no approval needed` : null) },
  {
    label: "Guarantee to the hospital (median)",
    value: (v) => hours(v.gopHoursMedian),
    note: (v) => (v.sla?.gopHours ? `Agreed: ${v.sla.gopHours} h` : null),
    warn: (v) => v.gopHoursMedian != null && !!v.sla?.gopHours && v.gopHoursMedian > v.sla.gopHours,
  },
  {
    label: "First contact within 30 minutes",
    value: (v) => (v.firstContactPct == null ? dash : `${v.firstContactPct}%`),
    note: (v) => (v.sla?.firstResponseMinutes ? `Agreed: ${v.sla.firstResponseMinutes} min` : null),
    warn: (v) => v.firstContactPct != null && v.firstContactPct < 80,
  },
];

export default function OversightPage() {
  const t = useT();
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/oversight", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "The partners could not be loaded."));
        setVendors((await r.json()).vendors);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function exportCsv() {
    if (!vendors) return;
    const cells = (v: Vendor) => [v.name, v.country, v.cases, v.openCases, v.critical, v.spendEur, v.costPerCaseEur ?? "", v.savingsFoundEur, v.savingsAcceptedEur, v.guarantees, v.autoApprovedPct ?? "", v.gopHoursMedian ?? "", v.firstContactPct ?? ""];
    const head = ["Assistance company", "Country", "Cases", "Open", "Critical", "Medical spend EUR", "Per case EUR", "Savings found EUR", "Savings accepted EUR", "Guarantees", "Auto-approved %", "Guarantee median hours", "First contact within 30 min %"];
    const csv = [head, ...vendors.map(cells)].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "assistance-partners-scorecard.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Partner oversight"
        subtitle="For insurers: every assistance company handling your travellers, scored from the same records: cases, medical spend, savings found, how fast guarantees reach hospitals and how fast travellers hear back."
      >
        <Button variant="secondary" onClick={exportCsv} disabled={!vendors?.length}>
          <Download size={15} aria-hidden /> {t("Export scorecard (CSV)")}
        </Button>
      </PageHeader>
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

      {!vendors ? (
        <Card><SkeletonRows rows={6} /></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 text-xs font-medium text-muted">{t("Measure")}</th>
                {vendors.map((v) => (
                  <th key={v.id} className="px-4 py-3">
                    <p className="font-semibold text-ink">{v.name}</p>
                    <p className="text-xs font-normal text-muted">{v.country}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {METRICS.map((m) => (
                <tr key={m.label}>
                  <td className="px-5 py-3 text-muted">{t(m.label)}</td>
                  {vendors.map((v) => (
                    <td key={v.id} className="px-4 py-3 align-top">
                      <p className={`font-semibold tabular-nums ${m.warn?.(v) ? "text-warn" : "text-ink"}`}>{m.value(v)}</p>
                      {m.note?.(v) ? <p className="text-xs text-muted">{m.note(v)}</p> : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="mt-5">
        <SectionTitle>How the scores are made</SectionTitle>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Every figure comes from the cases, guarantees and bill reviews in the platform: the same records each partner works in, not self-reported numbers.</li>
          <li>Medical spend is the reviewed invoice where there is one, else the open guarantees. Savings are bill review findings; accepted means a person agreed them.</li>
          <li>Agreed turnaround times come from each partner&apos;s service levels; anything slower shows in amber.</li>
        </ul>
      </Card>
    </div>
  );
}
