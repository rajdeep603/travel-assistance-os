"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { AlarmClock, AlertTriangle, CalendarCheck, CheckCircle2, ChevronDown, Mail, PhoneCall, Scale, Send, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { Button, Card, ErrorBanner, PageHeader, SectionTitle, SkeletonRows, StatTile, StatusBadge, readApiError } from "@/components/ui";
import { useQueryParam } from "@/lib/client/use-query-param";
import { formatDateTime, formatMoney, formatMoneyExact } from "@/lib/format";
import { useT } from "@/components/i18n";

type Bucket = "0-30" | "31-60" | "61-90" | "90+";
const BUCKETS: Bucket[] = ["0-30", "31-60", "61-90", "90+"];
// Sequential: fresh invoices calm, old ones warm.
const BUCKET_TONE: Record<Bucket, string> = { "0-30": "bg-brand-2", "31-60": "bg-brand", "61-90": "bg-warn", "90+": "bg-red-500" };
const BUCKET_LABEL: Record<Bucket, string> = { "0-30": "0–30 days", "31-60": "31–60 days", "61-90": "61–90 days", "90+": "Over 90 days" };

interface Check {
  label: string;
  ok: boolean;
  severity: "error" | "warning";
  fix?: string;
}

interface Receivable {
  id: string;
  ref: string;
  facility: string;
  payerName: string;
  payerCountry: string | null;
  patientName: string;
  policyNumber: string | null;
  gopRef: string | null;
  invoiceNumber: string;
  amount: number;
  currency: string;
  paidAmount: number;
  status: string;
  submittedAt: string | null;
  dueAt: string | null;
  attachments: string[];
  readiness: { ready: boolean; checks: Check[]; expectedDeduction: number; cleanAmount: number; at: string } | null;
  chases: { at: string; channel: "EMAIL" | "PHONE"; outcome: string; note?: string | null; by: string; callRef?: string | null }[];
  payerAnswer: { status: string; expectedPaymentDate?: string | null; missing?: string[]; contact?: string | null } | null;
  days: number | null;
  balance: number;
  overdue: boolean;
}

interface Overview {
  outstandingEur: number;
  overdueEur: number;
  overdueCount: number;
  disputedCount: number;
  averageDaysToPay: number | null;
  byPayer: { payer: string; country: string | null; buckets: Record<Bucket, number>; total: number; count: number }[];
  buckets: Record<Bucket, number>;
  facilities: string[];
  receivables: Receivable[];
}

const OPEN = new Set(["SUBMITTED", "ACKNOWLEDGED", "APPROVED", "PARTIALLY_PAID", "DISPUTED"]);

export default function ReceivablesPage() {
  const [facility, setFacility] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlOpen = useQueryParam("open");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/receivables${facility ? `?facility=${encodeURIComponent(facility)}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res, "The invoices could not be loaded."));
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "The invoices could not be loaded.");
    }
  }, [facility]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (urlOpen) setOpen(urlOpen.toUpperCase());
  }, [urlOpen]);

  const maxPayer = Math.max(1, ...(data?.byPayer.map((p) => p.total) ?? [1]));
  const t = useT();

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Receivables"
        subtitle="For hospitals and local correspondents: every invoice sent to a foreign payer, how long it has waited and the next chase. The payer-ready check finds what payers send back before the invoice goes out."
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{t("Billing desk")}</span>
          <select value={facility} onChange={(e) => setFacility(e.target.value)} className="w-64 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <option value="">{t("All facilities")}</option>
            {data?.facilities.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </PageHeader>
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Wallet} tone="blue" label={t("Outstanding")} value={data ? formatMoney(data.outstandingEur, "EUR") : "—"} note={t("At demo exchange rates")} />
        <StatTile icon={AlarmClock} tone="amber" label={t("Past due")} value={data ? formatMoney(data.overdueEur, "EUR") : "—"} note={data ? `${data.overdueCount} ${t("invoices")}` : ""} warn={!!data?.overdueCount} />
        <StatTile icon={CalendarCheck} tone="emerald" label={t("Average days to be paid")} value={data?.averageDaysToPay != null ? String(data.averageDaysToPay) : "—"} note={t("Invoices paid so far")} />
        <StatTile icon={Scale} tone="rose" label={t("Disputed")} value={data ? String(data.disputedCount) : "—"} note={t("Waiting for the billing manager")} warn={!!data?.disputedCount} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <SectionTitle>Outstanding by age</SectionTitle>
          {data ? (
            <>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-canvas" role="img" aria-label="Outstanding by age">
                {BUCKETS.map((b) =>
                  data.buckets[b] > 0 ? (
                    <div key={b} className={BUCKET_TONE[b]} style={{ width: `${(data.buckets[b] / Math.max(1, data.outstandingEur)) * 100}%` }} title={`${BUCKET_LABEL[b]}: ${formatMoney(data.buckets[b], "EUR")}`} />
                  ) : null
                )}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {BUCKETS.map((b) => (
                  <div key={b} className="flex items-start gap-2">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${BUCKET_TONE[b]}`} aria-hidden />
                    <div>
                      <dt className="text-xs text-muted">{t(BUCKET_LABEL[b])}</dt>
                      <dd className="text-sm font-semibold tabular-nums text-ink">{formatMoney(data.buckets[b], "EUR")}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <SkeletonRows rows={2} />
          )}
        </Card>
        <Card className="lg:col-span-3">
          <SectionTitle>By payer</SectionTitle>
          {data ? (
            <ul className="mt-3 space-y-3">
              {data.byPayer.map((p) => (
                <li key={p.payer}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-ink">
                      {p.payer} <span className="font-normal text-muted">· {p.country} · {p.count} {t("open")}</span>
                    </span>
                    <span className="tabular-nums text-ink">{formatMoney(p.total, "EUR")}</span>
                  </div>
                  <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-canvas" style={{ width: `${Math.max(8, (p.total / maxPayer) * 100)}%` }}>
                    {BUCKETS.map((b) => (p.buckets[b] > 0 ? <div key={b} className={BUCKET_TONE[b]} style={{ width: `${(p.buckets[b] / p.total) * 100}%` }} /> : null))}
                  </div>
                </li>
              ))}
              {data.byPayer.length === 0 ? <li className="text-sm text-muted">{t("Nothing outstanding.")}</li> : null}
            </ul>
          ) : (
            <SkeletonRows rows={4} />
          )}
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[680px] text-sm xl:min-w-[860px]">
          <thead>
            <tr className="border-b border-line text-left text-xs font-medium text-muted">
              <th className="px-5 py-3">{t("Invoice")}</th>
              <th className="hidden px-3 py-3 xl:table-cell">{t("Patient")}</th>
              <th className="px-3 py-3">{t("Payer")}</th>
              <th className="px-3 py-3 text-right">{t("Balance")}</th>
              <th className="px-3 py-3">{t("Status")}</th>
              <th className="px-3 py-3 text-right">{t("Days")}</th>
              <th className="px-5 py-3" aria-label="Open" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {(data?.receivables ?? []).map((r) => (
              <Fragment key={r.id}>
                <tr className="cursor-pointer hover:bg-canvas/60" onClick={() => setOpen(open === r.ref ? null : r.ref)}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink">{r.invoiceNumber}</p>
                    <p className="text-xs tabular-nums text-muted">{r.ref} · {r.facility}</p>
                    {/* The patient has its own column on a laptop; under the invoice on a tablet. */}
                    <p className="text-xs text-muted xl:hidden">{r.patientName}</p>
                  </td>
                  <td className="hidden px-3 py-3 text-ink/90 xl:table-cell">{r.patientName}</td>
                  <td className="px-3 py-3 text-ink/90">
                    {r.payerName}
                    <span className="block text-xs text-muted">{r.gopRef ? `${t("Guarantee")} ${r.gopRef}` : t("No guarantee quoted")}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink">{formatMoneyExact(r.balance, r.currency)}</td>
                  <td className="px-3 py-3"><StatusBadge value={r.status} /></td>
                  <td className={`px-3 py-3 text-right tabular-nums ${r.overdue ? "font-semibold text-warn" : "text-muted"}`}>{r.days ?? "—"}</td>
                  <td className="px-5 py-3 text-right">
                    <ChevronDown size={16} className={`inline text-muted transition-transform ${open === r.ref ? "rotate-180" : ""}`} aria-hidden />
                  </td>
                </tr>
                {open === r.ref ? (
                  <tr>
                    <td colSpan={7} className="bg-canvas/50 px-5 py-4">
                      <ReceivableDetail r={r} onChanged={load} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!data ? <div className="p-5"><SkeletonRows rows={5} /></div> : null}
      </Card>
    </div>
  );
}

function ReceivableDetail({ r, onChanged }: { r: Receivable; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(String(r.balance));
  const t = useT();

  async function act(action: "check" | "submit" | "chase" | "payment") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/receivables/${r.ref}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "payment" ? JSON.stringify({ amount: Number(amount) }) : undefined,
      });
      if (!res.ok) throw new Error(await readApiError(res, "That didn't work."));
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const readiness = r.readiness;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">{t("Payer-ready check")}</p>
          <Button variant="secondary" onClick={() => act("check")} busy={busy === "check"}>
            <ShieldCheck size={15} aria-hidden /> {readiness ? t("Check again") : t("Run the check")}
          </Button>
        </div>
        {readiness ? (
          <>
            <p className={`mt-2 text-sm font-medium ${readiness.ready ? "text-emerald-700" : "text-warn"}`}>
              {readiness.ready ? t("Ready to send: nothing a payer returns invoices for.") : t("Fix these before it goes out, or the payer will send it back.")}
              {readiness.expectedDeduction > 0 ? ` Expect about ${formatMoneyExact(readiness.expectedDeduction, r.currency)} to be queried; ${formatMoneyExact(readiness.cleanAmount, r.currency)} is clean.` : ""}
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {readiness.checks.map((c) => (
                <li key={c.label} className="flex gap-2">
                  {c.ok ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                  ) : c.severity === "error" ? (
                    <XCircle size={15} className="mt-0.5 shrink-0 text-red-500" aria-hidden />
                  ) : (
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                  )}
                  <span>
                    <span className="text-ink/90">{t(c.label)}</span>
                    {!c.ok && c.fix ? <span className="block text-xs text-muted">{c.fix}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">{t("Runs the payer's own rules on the invoice: guarantee, policy details, itemisation, the medical report, comfort items, duplicates, nights and prices.")}</p>
        )}
        <p className="mt-3 text-xs text-muted">{t("In the pack: itemised invoice")}{r.attachments.length ? `, ${r.attachments.join(", ")}` : ""}.</p>
      </div>

      <div>
        <p className="text-sm font-semibold text-ink">{t("Chasing")}</p>
        {r.payerAnswer ? (
          <p className="mt-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink/90">
            Payer&apos;s last answer: <span className="font-medium">{r.payerAnswer.status.replace(/_/g, " ").toLowerCase()}</span>
            {r.payerAnswer.expectedPaymentDate ? `, payment expected ${r.payerAnswer.expectedPaymentDate}` : ""}
            {r.payerAnswer.missing?.length ? `; missing: ${r.payerAnswer.missing.join(", ")}` : ""}
            {r.payerAnswer.contact ? ` (${r.payerAnswer.contact})` : ""}
          </p>
        ) : null}
        <ol className="mt-2 space-y-1.5 text-sm">
          {[...r.chases].reverse().map((c, i) => (
            <li key={i} className="flex gap-2">
              {c.channel === "PHONE" ? <PhoneCall size={14} className="mt-0.5 shrink-0 text-live" aria-hidden /> : <Mail size={14} className="mt-0.5 shrink-0 text-brand-2" aria-hidden />}
              <span>
                <span className="text-ink/90">{c.outcome}</span>
                <span className="block text-xs text-muted">
                  {formatDateTime(c.at)} · {c.by}
                  {c.callRef ? ` · ${c.callRef}` : ""}
                </span>
              </span>
            </li>
          ))}
          {r.chases.length === 0 ? <li className="text-sm text-muted">{t("Not sent yet.")}</li> : null}
        </ol>
        {error ? <div className="mt-3"><ErrorBanner message={error} /></div> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {r.status === "DRAFT" ? (
            <Button onClick={() => act("submit")} busy={busy === "submit"}>
              <Send size={15} aria-hidden /> {t("Send to the payer")}
            </Button>
          ) : null}
          {OPEN.has(r.status) ? (
            <>
              <Button variant="secondary" onClick={() => act("chase")} busy={busy === "chase"}>
                <Mail size={15} aria-hidden /> {t("Remind by e-mail")}
              </Button>
              <Link
                href={`/voice?agent=outbound-payment-followup&record=${r.ref}`}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink shadow-sm hover:bg-canvas"
              >
                <PhoneCall size={15} aria-hidden /> {t("Call the payer (AI)")}
              </Link>
              <span className="inline-flex items-center gap-1.5">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  aria-label="Amount received"
                  className="w-28 rounded-lg border border-line bg-surface px-2.5 py-2 text-sm tabular-nums"
                />
                <Button variant="success" onClick={() => act("payment")} busy={busy === "payment"}>
                  <Wallet size={15} aria-hidden /> {t("Paid")}
                </Button>
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
