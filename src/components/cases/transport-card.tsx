import Link from "next/link";
import { Check, PhoneOutgoing, Plane } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";

// ---------------------------------------------------------------------------
// Medical transport home: the treating doctor's assessment, the least
// intensive safe mode the rules picked, and every option's indicative cost,
// so the case manager sees what an air ambulance would have cost.
// ---------------------------------------------------------------------------

export interface TransportPlan {
  id: string;
  ref: string;
  callRef: string | null;
  mode: string;
  reasons: string[];
  status: string;
  currency: string;
  estimateLow: number;
  estimateHigh: number;
  createdAt: string;
  assessment: {
    diagnosis: string;
    fitToFly: boolean;
    fitFrom?: string | null;
    mobility: string;
    oxygenLpm: number;
    monitoring: string;
    escort: string;
    destination?: string | null;
    destinationCountry?: string | null;
    tariff?: string;
  };
  options: {
    distance: string;
    avoidedVsAirAmbulance: number;
    options: { mode: string; label: string; low: number; high: number; suitable: boolean }[];
  };
}

const STATUS: Record<string, string> = {
  ASSESSED: "Assessed",
  QUOTES_REQUESTED: "Quotes requested",
  BOOKED: "Booked",
  CANCELLED: "Cancelled",
};

const range = (low: number, high: number, ccy: string) => `${formatMoney(low, ccy)} – ${formatMoney(high, ccy)}`;

export function TransportCard({ plans, caseId }: { plans: TransportPlan[]; caseId: string }) {
  const plan = plans[0];
  if (!plan) {
    return (
      <Card>
        <SectionTitle>
          <span className="inline-flex items-center gap-2">
            <Plane size={16} aria-hidden className="text-muted" /> Medical transport home
          </span>
        </SectionTitle>
        <p className="mt-2 text-sm text-muted">No transport plan yet.</p>
        <Link
          href={`/voice?agent=outbound-medical-transport&caseId=${encodeURIComponent(caseId)}`}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
        >
          <PhoneOutgoing size={14} aria-hidden /> Assess with the treating doctor: AI call
        </Link>
      </Card>
    );
  }
  const a = plan.assessment;
  const chosen = plan.options.options.find((o) => o.mode === plan.mode);
  return (
    <Card className="animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>
          <span className="inline-flex items-center gap-2">
            <Plane size={16} aria-hidden className="text-muted" /> Medical transport home
            <span className="font-normal text-muted">· {plan.ref}</span>
          </span>
        </SectionTitle>
        <span className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-deep">
          {STATUS[plan.status] ?? plan.status}
        </span>
      </div>

      <p className="mt-3 text-lg font-semibold text-ink">{chosen?.label ?? "Not fit to fly yet"}</p>
      {plan.estimateHigh > 0 ? (
        <p className="text-sm tabular-nums text-muted">Indicative {range(plan.estimateLow, plan.estimateHigh, plan.currency)}</p>
      ) : null}
      <ul className="mt-2 space-y-1 text-sm text-ink">
        {plan.reasons.map((r) => (
          <li key={r} className="flex items-start gap-2">
            <Check size={14} aria-hidden className="mt-0.5 shrink-0 text-brand" /> {r}
          </li>
        ))}
      </ul>
      {plan.options.avoidedVsAirAmbulance > 0 ? (
        <p className="mt-3 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-ink">
          About <span className="font-semibold tabular-nums">{formatMoney(plan.options.avoidedVsAirAmbulance, plan.currency)}</span> less
          than an air ambulance, at the level of care the doctor asked for.
        </p>
      ) : null}

      <ol className="mt-3 divide-y divide-line rounded-lg border border-line text-sm">
        {plan.options.options.map((o) => (
          <li key={o.mode} className={`flex items-center justify-between gap-3 px-3 py-2 ${o.mode === plan.mode ? "bg-brand/5" : ""}`}>
            <span className={`min-w-0 ${o.suitable ? "text-ink" : "text-muted line-through"}`}>
              {o.label}
              {o.mode === plan.mode ? <span className="ml-2 text-xs font-semibold text-brand">Recommended</span> : null}
            </span>
            <span className={`shrink-0 tabular-nums ${o.suitable ? "text-ink" : "text-muted"}`}>{range(o.low, o.high, plan.currency)}</span>
          </li>
        ))}
      </ol>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted">Diagnosis</dt>
          <dd className="text-ink">{a.diagnosis}</dd>
        </div>
        <div>
          <dt className="text-muted">Fit to fly</dt>
          <dd className="text-ink">{a.fitToFly ? (a.fitFrom ? `From ${a.fitFrom}` : "Now") : `Not yet${a.fitFrom ? ` (${a.fitFrom})` : ""}`}</dd>
        </div>
        <div>
          <dt className="text-muted">Mobility</dt>
          <dd className="text-ink capitalize">{a.mobility.toLowerCase()}</dd>
        </div>
        <div>
          <dt className="text-muted">Oxygen</dt>
          <dd className="text-ink">{a.oxygenLpm ? `${a.oxygenLpm} L/min` : "None"}</dd>
        </div>
        <div>
          <dt className="text-muted">Escort</dt>
          <dd className="text-ink capitalize">{a.escort.toLowerCase()}</dd>
        </div>
        <div>
          <dt className="text-muted">Home to</dt>
          <dd className="text-ink">{a.destination ?? a.destinationCountry ?? "To confirm"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] text-muted">
        From the treating doctor{plan.callRef ? ` on ${plan.callRef}` : ""}, {formatDateTime(plan.createdAt)}. Fictional demo prices ({a.tariff ?? "demo tariff"}); the doctor decides
        the level of care.
      </p>
    </Card>
  );
}
