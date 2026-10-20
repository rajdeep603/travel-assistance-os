import { ArrowRight } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { CaseMoney } from "@/lib/services/exposure";

// ---------------------------------------------------------------------------
// Money on a case, left to right: what the hospital estimated, what we
// guaranteed, what it billed, what bill review recommends, what was paid.
// Below it, the policy limit: used, committed in open guarantees, remaining.
// ---------------------------------------------------------------------------

const eur = (n: number) => formatMoney(n, "EUR");

export function MoneyCard({ money: m }: { money: CaseMoney }) {
  const steps = [
    { label: "Estimated", value: m.estimated },
    { label: "Guaranteed", value: m.guaranteed, note: m.openLetters.map((l) => l.ref).join(", ") },
    { label: "Invoiced", value: m.invoiced },
    { label: "After review", value: m.afterReview, note: m.savingsIdentified > 0 ? `${eur(m.savingsIdentified)} found` : undefined },
    { label: "Paid", value: m.paid },
  ];
  if (steps.every((s) => s.value === 0)) return null;
  const p = m.policy;
  const pct = (n: number) => (p && p.limit > 0 ? Math.min(100, Math.max(0, (n / p.limit) * 100)) : 0);

  return (
    <Card>
      <SectionTitle>Money on this case</SectionTitle>
      {/* One row from estimate to payment on tablets and up; phones wrap. */}
      <ol className="mt-3 flex flex-wrap items-stretch gap-y-2 sm:flex-nowrap">
        {steps.map((s, i) => (
          <li key={s.label} className="flex min-w-0 items-center sm:flex-1">
            <div className={`min-w-[6.5rem] rounded-lg px-3 py-2 sm:min-w-0 sm:flex-1 sm:px-2.5 ${s.value > 0 ? "bg-canvas" : ""}`}>
              <p className="text-xs text-muted">{s.label}</p>
              <p className={`text-base font-semibold tabular-nums ${s.value > 0 ? "text-ink" : "text-muted"}`}>{s.value > 0 ? eur(s.value) : "—"}</p>
              {s.note ? <p className="text-[11px] text-muted">{s.note}</p> : null}
            </div>
            {i < steps.length - 1 ? <ArrowRight size={14} aria-hidden className="mx-1 shrink-0 text-line" /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
        <p className="text-sm text-muted">
          Expected cost still to pay{m.invoiced > 0 ? " (reviewed invoices)" : m.guaranteed > 0 ? " (open guarantees)" : ""}
        </p>
        <p className="text-xl font-semibold tabular-nums text-ink">{eur(m.exposure)}</p>
      </div>
      {m.savingsAccepted > 0 ? (
        <p className="mt-1 text-right text-xs text-brand">{eur(m.savingsAccepted)} saved, accepted by a person</p>
      ) : null}

      {p ? (
        <div className="mt-4">
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>
              Policy {p.number} · {p.plan} · limit {formatMoney(p.limit, p.currency)}
            </span>
            <span className="tabular-nums">{formatMoney(p.remaining, p.currency)} left</span>
          </div>
          <div
            className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-canvas"
            role="img"
            aria-label={`Used ${formatMoney(p.used, p.currency)}, committed ${formatMoney(p.committed, p.currency)}, ${formatMoney(p.remaining, p.currency)} left`}
          >
            <div className="h-full bg-muted/60" style={{ width: `${pct(p.used)}%` }} />
            <div className="h-full bg-brand" style={{ width: `${pct(p.committed)}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-muted/60 align-middle" aria-hidden /> Used {formatMoney(p.used, p.currency)}
            <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-full bg-brand align-middle" aria-hidden /> Committed in open guarantees{" "}
            {formatMoney(p.committed, p.currency)}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
