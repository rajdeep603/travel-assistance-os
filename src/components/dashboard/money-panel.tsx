import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { CountUp } from "@/components/count-up";
import type { MoneyOutcomes } from "@/lib/services/exposure";

// ---------------------------------------------------------------------------
// Medical spend, the figure a claims director asks for first: what bill
// review found above the reference tariff, how much of it a person accepted,
// the average saving, and what open guarantees commit against policy limits.
// ---------------------------------------------------------------------------

const euros = (n: number) => `€${Math.round(n).toLocaleString("en-GB")}`;

/** The average saving as a ring: a share is easier to read as a filled arc than as a number alone. */
function SavingRing({ share }: { share: number | null }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = share == null ? 0 : Math.min(1, share / 100) * c;
  return (
    <div className="relative h-24 w-24 shrink-0" role="img" aria-label={share == null ? "No bills reviewed yet" : `Average saving ${share}%`}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-brand/10" />
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${filled} ${c}`} className="stroke-brand" />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums text-ink">{share == null ? "—" : <><CountUp value={share} />%</>}</span>
        <span className="text-[10px] font-medium text-muted">avg saving</span>
      </span>
    </div>
  );
}

export function MoneyPanel({ money: m, href }: { money: MoneyOutcomes; href: string }) {
  const share = m.averageSavingShare == null ? null : Math.round(m.averageSavingShare * 100);
  const accepted = m.savingsIdentifiedEur > 0 ? Math.min(1, m.savingsAcceptedEur / m.savingsIdentifiedEur) : 0;
  return (
    <section aria-labelledby="money-title" className="flex h-full flex-col rounded-2xl border border-line/80 bg-surface p-5 shadow-sm md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="money-title" className="text-base font-semibold text-ink">
          Medical spend under control
        </h2>
        <span className="text-xs text-muted">Last {m.days} days</span>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-4xl font-semibold tracking-tight tabular-nums text-ink md:text-5xl">
            <CountUp value={m.savingsIdentifiedEur} currency="EUR" />
          </p>
          <p className="mt-1 text-sm font-medium text-ink">found above the reference tariff</p>
          <p className="text-xs text-muted">
            On {m.billsReviewed} hospital {m.billsReviewed === 1 ? "bill" : "bills"} reviewed line by line: overcharges, extra nights, duplicates and comfort items
          </p>

          {/* Of what was found, how much a person has accepted. */}
          <div className="mt-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-brand/10" aria-hidden>
              <div className="animate-bar-grow h-full rounded-full bg-brand" style={{ width: `${accepted * 100}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
              <span className="font-medium text-ink">
                <span className="tabular-nums">
                  <CountUp value={m.savingsAcceptedEur} currency="EUR" />
                </span>{" "}
                saved, accepted by a person
              </span>
              {m.awaitingDecision ? (
                <Link href={href} className="font-medium text-amber-700 underline-offset-2 hover:underline">
                  {m.awaitingDecision} {m.awaitingDecision === 1 ? "review awaits" : "reviews await"} a decision
                </Link>
              ) : (
                <span className="text-muted">Nothing awaiting a decision</span>
              )}
            </div>
          </div>
        </div>
        <SavingRing share={share} />
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-xl bg-canvas px-4 py-3">
        <ShieldCheck size={20} className="shrink-0 text-brand" aria-hidden />
        <p className="min-w-0 text-sm text-ink">
          <span className="font-semibold tabular-nums">{euros(m.openGuarantees.eur)}</span> committed in open guarantees
          <span className="block text-xs text-muted">
            {m.openGuarantees.count} {m.openGuarantees.count === 1 ? "letter" : "letters"} on open cases, counted against each policy&rsquo;s limit
          </span>
        </p>
      </div>
    </section>
  );
}
