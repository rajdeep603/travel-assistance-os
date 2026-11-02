"use client";

import Link from "next/link";
import { Car, CheckCircle2, Copy, Handshake, Link2, MapPin, PhoneOutgoing, ShieldCheck, Video } from "lucide-react";
import { AccreditationBadge } from "@/components/providers/accreditation-badge";
import { Stars } from "@/components/providers/stars";
import { Button } from "@/components/ui";
import { formatMoney, formatTimeAgo } from "@/lib/format";

// ---------------------------------------------------------------------------
// One result of "Find care": who, how far and how long by road, open now,
// rating, what it costs, why it is here; book a slot, validate by phone,
// send the price-list link, open the record.
// ---------------------------------------------------------------------------

export interface CareResultView {
  provider: {
    id: string;
    ref: string;
    name: string;
    facility: string;
    specialty: string;
    address: string;
    district: string;
    city: string;
    kind: string;
    languages: string[];
    phone: string;
    email: string;
    rating: number;
    internalRating: number | null;
    accreditations: string[];
    rateCard: { name: string; multiplier?: number } | null;
    status: string;
    lastVerifiedAt: string | null;
    acceptsDirectBilling: boolean | null;
    hours: string | null;
    priceListStatus: string;
    latitude: number;
    longitude: number;
  };
  distanceKm: number | null;
  travel: { minutes: number; basis: "driving" | "estimate" } | null;
  open: { open: boolean | null; until?: string; opensAt?: string };
  estimate: { item: string; amount: number; currency: string; basis: "quoted" | "network" } | null;
  slots: { date: string; time: string }[];
  duplicatesMerged: number;
  score: number;
  reasons: string[];
}

export const STATUS_LABEL: Record<string, string> = {
  UNVERIFIED: "not verified yet",
  VERIFIED: "verified",
  CLOSED: "closed",
  MOVED: "moved",
  UNREACHABLE: "not reachable",
};

const STATUS_TONE: Record<string, string> = {
  VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CLOSED: "border-red-200 bg-red-50 text-red-700",
  MOVED: "border-amber-200 bg-amber-50 text-amber-700",
  UNREACHABLE: "border-amber-200 bg-amber-50 text-amber-700",
  UNVERIFIED: "border-line bg-canvas text-muted",
};

export function ProviderStatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status] ?? STATUS_TONE.UNVERIFIED}`}>{STATUS_LABEL[status] ?? status.toLowerCase()}</span>;
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function CareResultCard({
  r,
  rank,
  selected,
  onFocus,
  onBook,
  onValidate,
  onLink,
}: {
  r: CareResultView;
  rank: number;
  selected?: boolean;
  onFocus?: () => void;
  onBook: (slot: { date: string; time: string }) => void;
  onValidate: () => void;
  onLink: () => void;
}) {
  const p = r.provider;
  const video = p.kind === "TELEMEDICINE";
  return (
    <article className={`rounded-2xl border bg-surface p-4 shadow-card transition-colors duration-150 ${selected ? "border-brand ring-2 ring-brand/15" : "border-line"}`} onMouseEnter={onFocus} onClick={onFocus}>
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand bg-brand-gradient text-sm font-bold text-white shadow-glow">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/providers/${p.ref}`} className="truncate text-base font-semibold text-ink hover:text-brand">
              {p.facility}
            </Link>
            {p.status !== "UNVERIFIED" ? <ProviderStatusBadge status={p.status} /> : null}
            {video ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-live/30 bg-live/10 px-2 py-0.5 text-[11px] font-medium text-live">
                <Video size={12} aria-hidden /> Video consultation
              </span>
            ) : null}
            {p.accreditations.map((a) => (
              <AccreditationBadge key={a} name={a} />
            ))}
            {p.rateCard ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted" title={p.rateCard.name}>
                <Handshake size={12} aria-hidden /> Network rates
              </span>
            ) : null}
            {r.duplicatesMerged ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted" title="Duplicate records merged into this one">
                <Copy size={11} aria-hidden /> {r.duplicatesMerged} merged
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {p.name} · {p.specialty}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink">
            <MapPin size={13} className="shrink-0 text-muted" aria-hidden />
            <span className="truncate">{video ? "Anywhere, by video" : `${p.address}, ${p.district}, ${p.city}`}</span>
            {r.distanceKm != null ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{formatDistance(r.distanceKm)}</span> : null}
            {r.travel ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted" title={r.travel.basis === "driving" ? "Driving time by road" : "Estimated from the distance"}>
                <Car size={11} aria-hidden /> {r.travel.minutes} min{r.travel.basis === "estimate" ? " est." : ""}
              </span>
            ) : null}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <Stars value={p.rating} />
            {p.internalRating != null ? <span>Team {p.internalRating.toFixed(1)}/5</span> : null}
            {r.open.open === true ? (
              <span className="font-semibold text-emerald-700">{r.open.until === "00:00" || p.hours === "24/7" ? "Open 24 hours" : `Open now${r.open.until ? ` · closes ${r.open.until}` : ""}`}</span>
            ) : r.open.open === false ? (
              <span className="font-semibold text-warn">Closed now{r.open.opensAt ? ` · opens ${r.open.opensAt}` : ""}</span>
            ) : p.hours ? (
              <span>{p.hours}</span>
            ) : (
              <span>hours not confirmed</span>
            )}
            {p.languages.length ? <span>{p.languages.join(", ")}</span> : null}
            {p.acceptsDirectBilling || p.rateCard ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <ShieldCheck size={12} aria-hidden /> direct billing
              </span>
            ) : null}
          </div>
          {r.reasons.length ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
              <span className="font-medium">Why here:</span>
              {r.reasons.map((reason) => (
                <span key={reason} className="inline-flex items-center gap-1">
                  <CheckCircle2 size={11} className="text-emerald-500" aria-hidden /> {reason}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-end">
          {r.estimate ? (
            <>
              <p className="text-lg font-bold tabular-nums text-ink">{formatMoney(r.estimate.amount, r.estimate.currency)}</p>
              <p className="text-[11px] text-muted">{r.estimate.basis === "quoted" ? "quoted by the practice" : "network estimate"}</p>
            </>
          ) : (
            <p className="text-[11px] text-muted">no estimate yet</p>
          )}
          <p className="mt-1 text-[11px] text-muted">{p.lastVerifiedAt ? `verified ${formatTimeAgo(p.lastVerifiedAt)}` : "not verified yet"}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 ps-11">
        {r.slots.length ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted">Book:</span>
            {r.slots.map((s) => (
              <button
                key={`${s.date}-${s.time}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBook(s);
                }}
                className="rounded-md border border-brand/30 bg-brand/5 px-2.5 py-1 text-xs font-semibold tabular-nums text-brand transition-colors hover:bg-brand/10"
              >
                {s.time}
              </button>
            ))}
          </span>
        ) : (
          <span className="text-[11px] text-muted">No free slots that day</span>
        )}
        <span className="ms-auto flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          <Button variant="secondary" onClick={onValidate}>
            <PhoneOutgoing size={13} aria-hidden /> Validate by phone
          </Button>
          <Button variant="secondary" onClick={onLink}>
            <Link2 size={13} aria-hidden /> Price-list link
          </Button>
        </span>
      </div>
    </article>
  );
}
