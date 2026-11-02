"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Handshake, Link2, Mail, MapPin, Phone, PhoneOutgoing, Star } from "lucide-react";
import { ProviderMap } from "@/components/provider-map";
import { AccreditationBadge } from "@/components/providers/accreditation-badge";
import { ProviderStatusBadge, STATUS_LABEL } from "@/components/providers/care-result-card";
import { PriceLinkDialog } from "@/components/providers/price-link-dialog";
import { Stars } from "@/components/providers/stars";
import { ValidateDialog } from "@/components/providers/validate-dialog";
import { Button, Card, ErrorBanner, SectionTitle, SkeletonRows, readApiError } from "@/components/ui";
import { formatDateTime, formatEnum, formatMoney, formatTimeAgo } from "@/lib/format";
import { PRICE_ITEM_LABELS } from "@/lib/services/provider-needs";

// ---------------------------------------------------------------------------
// One provider: what we know and who established it (the AI call, the
// practice's own link, the team), prices, the validation calls, the change
// log, and "how did the referral go?", which feeds the team rating.
// ---------------------------------------------------------------------------

interface Detail {
  id: string;
  ref: string;
  name: string;
  facility: string;
  specialty: string;
  address: string;
  district: string;
  city: string;
  country: string;
  kind: string;
  languages: string[];
  phone: string;
  email: string;
  rating: number;
  internalRating: number | null;
  accreditations: string[];
  rateCard: { name: string; multiplier?: number } | null;
  aliases: string[];
  status: string;
  lastVerifiedAt: string | null;
  verificationNote: string | null;
  hours: string | null;
  acceptsDirectBilling: boolean | null;
  priceListStatus: string;
  latitude: number;
  longitude: number;
  prices: { id: string; item: string; amount: number; currency: string; source: string; note: string | null; collectedAt: string }[];
  priceLinks: { id: string; sentVia: string | null; sentTo: string | null; sentAt: string | null; openedAt: string | null; submittedAt: string | null; uploadName: string | null; createdAt: string }[];
  changes: { id: string; field: string; before: string | null; after: string | null; source: string; actor: string | null; createdAt: string }[];
  feedback: { id: string; rating: number; comment: string | null; by: string | null; caseRef: string | null; createdAt: string }[];
  mergedFrom: { ref: string; facility: string; name: string }[];
  mergedInto: { ref: string; facility: string } | null;
  _count: { appointments: number; guaranteeLetters: number };
  calls: { id: string; ref: string; status: string; startedAt: string; durationSec: number | null; summary: string | null; language: string | null }[];
}

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  lastVerifiedAt: "Last verified",
  verificationNote: "Note",
  hours: "Hours",
  acceptsDirectBilling: "Direct billing",
  priceListStatus: "Price list",
  internalRating: "Team rating",
  email: "E-mail",
  phone: "Phone",
  address: "Address",
  mergedIntoId: "Merged",
};

export default function ProviderPage() {
  const { ref } = useParams<{ ref: string }>();
  const [p, setP] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validate, setValidate] = useState(false);
  const [link, setLink] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fbRating, setFbRating] = useState(0);
  const [fbComment, setFbComment] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(ref)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not load the provider."));
      setP((await res.json()).provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the provider.");
    }
  }, [ref]);

  useEffect(() => {
    void load();
  }, [load]);

  // From the cleanup queue: straight into the call.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("validate") === "1") setValidate(true);
  }, []);

  async function post(path: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(ref)}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await readApiError(res, "That didn't work."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  if (error && !p) {
    return (
      <div className="mx-auto max-w-5xl">
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!p) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      </div>
    );
  }

  const latestPrices = new Map<string, Detail["prices"][number]>();
  for (const q of p.prices) if (!latestPrices.has(q.item)) latestPrices.set(q.item, q);
  const billing = p.acceptsDirectBilling != null ? p.acceptsDirectBilling : p.rateCard ? true : null;

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/providers" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-brand">
        <ArrowLeft size={14} aria-hidden /> Find care
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-ink md:text-3xl">{p.facility}</h1>
            <ProviderStatusBadge status={p.status} />
            {p.priceListStatus !== "NONE" ? <span className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted">{p.priceListStatus === "RECEIVED" ? "price list received" : "link sent"}</span> : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            {p.name} · {p.specialty} · {formatEnum(p.kind)} · <span className="tabular-nums">{p.ref}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink">
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} className="text-muted" aria-hidden /> {p.address}, {p.district}, {p.city}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone size={13} className="text-muted" aria-hidden /> <bdi dir="ltr">{p.phone}</bdi>
            </span>
            <span className="inline-flex items-center gap-1">
              <Mail size={13} className="text-muted" aria-hidden /> {p.email}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setValidate(true)}>
            <PhoneOutgoing size={15} aria-hidden /> Validate by phone
          </Button>
          <Button variant="secondary" onClick={() => setLink(true)}>
            <Link2 size={15} aria-hidden /> Price-list link
          </Button>
        </div>
      </div>
      {error ? (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <SectionTitle>What we know</SectionTitle>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Fact label="Public rating">
                <Stars value={p.rating} />
              </Fact>
              <Fact label="Team rating (1–5)">
                {p.internalRating != null ? (
                  <Stars value={p.internalRating} />
                ) : (
                  <span className="text-muted">no referral rated yet</span>
                )}
              </Fact>
              <Fact label="Opening hours">{p.hours ?? <span className="text-muted">not confirmed (slot template only)</span>}</Fact>
              <Fact label="Languages">{p.languages.join(", ")}</Fact>
              <Fact label="Direct billing">
                {billing === true ? (
                  <span className="text-emerald-700">bills the assistance company directly{p.rateCard ? ` · ${p.rateCard.name}` : ""}</span>
                ) : billing === false ? (
                  "patients pay, invoice for reimbursement"
                ) : (
                  <span className="text-muted">unknown</span>
                )}
              </Fact>
              <Fact label="Accreditations">
                {p.accreditations.length ? (
                  <span className="flex flex-wrap gap-1">
                    {p.accreditations.map((a) => (
                      <AccreditationBadge key={a} name={a} />
                    ))}
                  </span>
                ) : (
                  <span className="text-muted">none on file</span>
                )}
              </Fact>
              <Fact label="Last verified">
                <span className="flex flex-wrap items-center gap-2">
                  {p.lastVerifiedAt ? `${formatDateTime(p.lastVerifiedAt)} (${formatTimeAgo(p.lastVerifiedAt)})` : "never"}
                  {(["VERIFIED", "CLOSED", "MOVED"] as const).map((s) =>
                    p.status !== s ? (
                      <button key={s} type="button" disabled={busy === `status:${s}`} onClick={() => void post("status", { status: s }, `status:${s}`)} className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted hover:border-brand/40 hover:text-ink">
                        mark {STATUS_LABEL[s]}
                      </button>
                    ) : null
                  )}
                </span>
              </Fact>
              <Fact label="History">
                {p._count.appointments} appointments · {p._count.guaranteeLetters} guarantees
                {p.mergedFrom.length ? ` · ${p.mergedFrom.length} duplicate${p.mergedFrom.length > 1 ? "s" : ""} merged in` : ""}
              </Fact>
            </div>
            {p.verificationNote ? <p className="mt-3 rounded-xl border border-line bg-canvas p-3 text-sm text-ink">{p.verificationNote}</p> : null}
            {p.mergedInto ? (
              <p className="mt-2 text-xs text-muted">
                Merged into{" "}
                <Link href={`/providers/${p.mergedInto.ref}`} className="font-medium text-brand hover:underline">
                  {p.mergedInto.ref} · {p.mergedInto.facility}
                </Link>
              </p>
            ) : null}
          </Card>

          <Card>
            <SectionTitle>Prices</SectionTitle>
            {latestPrices.size ? (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-start text-xs font-medium text-muted">
                    <th className="py-2 text-start">Item</th>
                    <th className="py-2 text-end">Price</th>
                    <th className="py-2 ps-3 text-start">Source</th>
                    <th className="py-2 ps-3 text-start">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {[...latestPrices.values()].map((q) => (
                    <tr key={q.id}>
                      <td className="py-2 text-ink">{PRICE_ITEM_LABELS[q.item as keyof typeof PRICE_ITEM_LABELS] ?? q.item}</td>
                      <td className="py-2 text-end font-semibold tabular-nums text-ink">{formatMoney(q.amount, q.currency)}</td>
                      <td className="py-2 ps-3 text-xs text-muted">
                        {q.source === "CALL" ? "AI call" : q.source === "FORM" ? "practice's form" : q.source === "UPLOAD" ? "price list (AI-read)" : "team"}
                        {q.note ? ` · ${q.note}` : ""}
                      </td>
                      <td className="py-2 ps-3 text-xs tabular-nums text-muted">{formatDateTime(q.collectedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">No prices yet. Validate by phone (Ada asks a few), or send the price-list link.</p>
            )}
          </Card>

          <Card>
            <SectionTitle>Validation calls</SectionTitle>
            {p.calls.length ? (
              <ul className="mt-3 divide-y divide-line/60">
                {p.calls.map((c) => (
                  <li key={c.id} className="py-2.5">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Link href={`/calls/${c.id}`} className="font-semibold tabular-nums text-brand hover:underline">
                        {c.ref}
                      </Link>
                      <span className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">{formatEnum(c.status)}</span>
                      <span className="text-xs text-muted">
                        {formatDateTime(c.startedAt)}
                        {c.durationSec != null ? ` · ${c.durationSec}s` : ""}
                        {c.language ? ` · ${c.language}` : ""}
                      </span>
                    </p>
                    {c.summary ? <p className="mt-1 text-sm text-ink">{c.summary}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No validation call yet. Ada can ring the practice now and the record updates itself.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-0">
            <ProviderMap providers={[{ id: p.id, name: p.name, facility: p.facility, latitude: p.latitude, longitude: p.longitude }]} origin={null} selectedId={p.id} onSelect={() => undefined} className="rounded-2xl" />
          </Card>

          <Card>
            <SectionTitle>How did the referral go?</SectionTitle>
            <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} type="button" role="radio" aria-checked={fbRating === i} aria-label={`${i} star${i > 1 ? "s" : ""}`} onClick={() => setFbRating(i)} className="p-0.5">
                  <Star size={22} className={i <= fbRating ? "text-amber-400" : "text-slate-200"} fill="currentColor" aria-hidden />
                </button>
              ))}
            </div>
            <textarea value={fbComment} onChange={(e) => setFbComment(e.target.value)} rows={2} placeholder="e.g. Seen within 20 minutes, invoice came the same day" className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
            <Button
              className="mt-2"
              disabled={!fbRating}
              busy={busy === "feedback"}
              onClick={() =>
                void post("feedback", { rating: fbRating, comment: fbComment || undefined }, "feedback").then(() => {
                  setFbRating(0);
                  setFbComment("");
                })
              }
            >
              Save feedback
            </Button>
            <p className="mt-2 text-xs text-muted">The team rating is the average of the last ten referrals rated here.</p>
            {p.feedback.length ? (
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-muted">
                {p.feedback.slice(0, 5).map((f) => (
                  <li key={f.id}>
                    <span className="font-semibold text-ink">{f.rating}/5</span>
                    {f.comment ? ` · ${f.comment}` : ""} · {f.by ?? "team"} · {formatTimeAgo(f.createdAt)}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {p.rateCard ? (
            <Card>
              <SectionTitle>Network rates</SectionTitle>
              <p className="mt-2 flex items-center gap-2 text-sm text-ink">
                <Handshake size={15} className="text-brand" aria-hidden /> {p.rateCard.name}
                {p.rateCard.multiplier ? <span className="text-muted">· {Math.round(p.rateCard.multiplier * 100)}% of the reference tariff</span> : null}
              </p>
              <p className="mt-1 text-xs text-muted">Bill review accepts invoices from this provider against these rates.</p>
            </Card>
          ) : null}

          {p.priceLinks.length ? (
            <Card>
              <SectionTitle>Price-list links</SectionTitle>
              <ul className="mt-2 space-y-1.5 text-xs text-muted">
                {p.priceLinks.map((l) => (
                  <li key={l.id}>
                    {l.sentAt ? `Sent by ${l.sentVia} to ${l.sentTo}` : "Created"} {formatTimeAgo(l.sentAt ?? l.createdAt)}
                    {l.openedAt ? ` · opened ${formatTimeAgo(l.openedAt)}` : ""}
                    {l.submittedAt ? <span className="font-semibold text-emerald-700"> · answered {formatTimeAgo(l.submittedAt)}</span> : ""}
                    {l.uploadName ? ` · ${l.uploadName}` : ""}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <SectionTitle>Change log</SectionTitle>
            {p.changes.length ? (
              <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto text-xs">
                {p.changes.map((c) => (
                  <li key={c.id} className="rounded-lg border border-line bg-canvas/60 px-2.5 py-1.5">
                    <p className="text-ink">
                      <span className="font-semibold">{FIELD_LABELS[c.field] ?? c.field}</span>: <span className="text-muted line-through">{c.before ?? "—"}</span> → {c.after ?? "—"}
                    </p>
                    <p className="text-muted">
                      {formatDateTime(c.createdAt)} · {c.source === "CALL" ? "AI call" : c.source === "FORM" ? "the practice" : c.source.toLowerCase()}
                      {c.actor ? ` · ${c.actor}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">Nothing changed on this record yet.</p>
            )}
          </Card>
        </div>
      </div>

      {validate ? <ValidateDialog providerRef={p.ref} providerName={p.facility} phone={p.phone} onClose={() => setValidate(false)} onDone={() => void load()} /> : null}
      {link ? <PriceLinkDialog providerRef={p.ref} providerName={p.facility} phone={p.phone} email={p.email} onClose={() => setLink(false)} onDone={() => void load()} /> : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="mt-0.5 text-sm text-ink">{children}</div>
    </div>
  );
}
