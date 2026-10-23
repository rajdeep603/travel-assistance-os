"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, GitMerge, Handshake, Mail, MapPin, Phone, Undo2 } from "lucide-react";
import { AccreditationBadge } from "@/components/providers/accreditation-badge";
import { Button, Card, EmptyState, ErrorBanner, PageHeader, SectionTitle, SkeletonRows, readApiError } from "@/components/ui";
import { formatDateTime, formatEnum } from "@/lib/format";
import { useT } from "@/components/i18n";

interface ProviderRow {
  id: string;
  ref: string;
  name: string;
  facility: string;
  specialty?: string;
  address?: string;
  district?: string;
  city: string;
  country: string;
  phone?: string;
  email?: string;
  languages?: string[];
  kind: string;
  accreditations: string[];
  rateCard: { name: string; multiplier?: number } | null;
  aliases: string[];
  _count?: { appointments: number; guaranteeLetters: number };
}

interface Pair {
  a: ProviderRow;
  b: ProviderRow;
  score: number;
  reasons: string[];
  suggestedKeepId: string;
}

interface Overview {
  active: number;
  merged: number;
  accredited: number;
  withRates: number;
  countries: number;
  byKind: Record<string, number>;
  duplicates: Pair[];
  merges: { id: string; kept: { ref: string; facility: string }; removed: { ref: string; facility: string }; reasons: string[]; score: number; mergedBy: string; createdAt: string; undoneAt: string | null }[];
  providers: ProviderRow[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function ProviderNetworkPage() {
  const t = useT();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/providers/network", { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not load the provider network."));
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the provider network.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function merge(pair: Pair) {
    const keepId = keep[pairKey(pair)] ?? pair.suggestedKeepId;
    const removeId = keepId === pair.a.id ? pair.b.id : pair.a.id;
    const kept = keepId === pair.a.id ? pair.a : pair.b;
    setBusy(pairKey(pair));
    setError(null);
    try {
      const res = await fetch("/api/providers/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepId, removeId }) });
      if (!res.ok) throw new Error(await readApiError(res, "The merge failed."));
      setDone(`Merged into ${kept.ref} · ${kept.facility}. Its appointments and letters moved with it; the old spelling is kept as an alias.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The merge failed.");
    } finally {
      setBusy(null);
    }
  }

  async function undo(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/providers/merges/${id}/undo`, { method: "POST" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not undo the merge."));
      setDone("Merge undone: both records are back as they were.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not undo the merge.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Provider network"
        subtitle="One record per provider: duplicates found by name, phone, e-mail and location, merged with their history. Accreditations and negotiated rates live on the provider."
      >
        <Link href="/providers" className="text-sm font-medium text-brand hover:underline">
          {t("Back to Provider Search")}
        </Link>
      </PageHeader>

      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}
      {done ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
          <CheckCircle2 size={16} aria-hidden /> {done}
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("Providers in the network")} value={data ? String(data.active) : "—"} note={data ? `${data.countries} ${t("countries")}` : ""} />
        <Stat label={t("Likely duplicates")} value={data ? String(data.duplicates.length) : "—"} note={data ? `${data.merged} ${t("merged so far")}` : ""} tone={data && data.duplicates.length ? "warn" : undefined} />
        <Stat label={t("Accredited")} value={data ? String(data.accredited) : "—"} note={data && data.active ? `${pct(data.accredited / data.active)} ${t("of the network")}` : ""} />
        <Stat label={t("With negotiated rates")} value={data ? String(data.withRates) : "—"} note={t("Used by bill review")} />
      </div>

      <section className="mb-6">
        <SectionTitle className="mb-3">Likely duplicates</SectionTitle>
        {!data ? (
          <Card><SkeletonRows rows={3} /></Card>
        ) : data.duplicates.length === 0 ? (
          <EmptyState title="No duplicates left" hint="Every provider appears once. New imports are checked the same way." />
        ) : (
          <div className="space-y-4">
            {data.duplicates.map((pair) => {
              const key = pairKey(pair);
              const chosen = keep[key] ?? pair.suggestedKeepId;
              return (
                <Card key={key}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">
                      {pair.a.facility} <span className="font-normal text-muted">and</span> {pair.b.facility}
                    </p>
                    <span className="rounded-full border border-warn/30 bg-warn/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-warn">
                      {pct(pair.score)} {t("match")}
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[pair.a, pair.b].map((p) => (
                      <label
                        key={p.id}
                        className={`block cursor-pointer rounded-xl border p-4 transition-colors ${chosen === p.id ? "border-brand/50 bg-brand/[0.04] ring-2 ring-brand/15" : "border-line hover:border-brand/30"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs tabular-nums text-muted">{p.ref}</p>
                            <p className="font-semibold text-ink">{p.facility}</p>
                            <p className="text-sm text-muted">{p.name} · {p.specialty}</p>
                          </div>
                          <input
                            type="radio"
                            name={key}
                            checked={chosen === p.id}
                            onChange={() => setKeep((k) => ({ ...k, [key]: p.id }))}
                            className="mt-1 accent-brand"
                            aria-label={`Keep ${p.ref}`}
                          />
                        </div>
                        <dl className="mt-3 space-y-1 text-xs text-muted">
                          <div className="flex items-center gap-1.5"><MapPin size={12} aria-hidden /> {p.address}, {p.district}, {p.city}</div>
                          <div className="flex items-center gap-1.5"><Phone size={12} aria-hidden /> {p.phone}</div>
                          <div className="flex items-center gap-1.5"><Mail size={12} aria-hidden /> {p.email}</div>
                          <div>Languages: {p.languages?.join(", ")}</div>
                          <div className="tabular-nums">History: {p._count?.appointments ?? 0} appointments, {p._count?.guaranteeLetters ?? 0} guarantees</div>
                        </dl>
                        <p className="mt-2 text-xs font-medium text-brand">{chosen === p.id ? t("Kept") : t("Merged into the other record")}</p>
                      </label>
                    ))}
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-ink/80">
                    {pair.reasons.map((r) => (
                      <li key={r} className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-live" aria-hidden /> {r}</li>
                    ))}
                  </ul>
                  <div className="mt-4 flex justify-end">
                    <Button onClick={() => merge(pair)} busy={busy === key}>
                      <GitMerge size={15} aria-hidden /> {t("Merge into")} {chosen === pair.a.id ? pair.a.ref : pair.b.ref}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {data && data.merges.length ? (
        <section className="mb-6">
          <SectionTitle className="mb-3">Recent merges</SectionTitle>
          <Card className="divide-y divide-line/70 p-0">
            {data.merges.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0 text-sm">
                  <p className="text-ink">
                    <span className="tabular-nums text-muted">{m.removed.ref}</span> {m.removed.facility} → <span className="tabular-nums text-muted">{m.kept.ref}</span> {m.kept.facility}
                  </p>
                  <p className="text-xs text-muted">
                    By {m.mergedBy} · {formatDateTime(m.createdAt)}{m.undoneAt ? ` · undone ${formatDateTime(m.undoneAt)}` : ""}
                  </p>
                </div>
                {m.undoneAt ? (
                  <span className="text-xs text-muted">Undone</span>
                ) : (
                  <Button variant="secondary" onClick={() => undo(m.id)} busy={busy === m.id}>
                    <Undo2 size={15} aria-hidden /> {t("Undo")}
                  </Button>
                )}
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <section>
        <SectionTitle className="mb-3">The network</SectionTitle>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium text-muted">
                <th className="px-5 py-3">{t("Provider")}</th>
                <th className="px-3 py-3">{t("Where")}</th>
                <th className="px-3 py-3">{t("Kind")}</th>
                <th className="px-3 py-3">{t("Accreditations")}</th>
                <th className="px-5 py-3">{t("Network rates")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {(data?.providers ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-ink">{p.facility}</p>
                    <p className="text-xs text-muted">
                      <span className="tabular-nums">{p.ref}</span> · {p.name}
                      {p.aliases.length ? ` · also "${p.aliases[0]}"` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-muted">{p.city}, {p.country}</td>
                  <td className="px-3 py-2.5 text-muted">{formatEnum(p.kind)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {p.accreditations.length ? p.accreditations.map((a) => <AccreditationBadge key={a} name={a} />) : <span className="text-xs text-muted">—</span>}
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted">
                    {p.rateCard ? (
                      <span className="inline-flex items-center gap-1 text-ink/80">
                        <Handshake size={13} className="text-brand" aria-hidden /> {p.rateCard.name}
                        {p.rateCard.multiplier ? ` (${Math.round(p.rateCard.multiplier * 100)}% of reference)` : ""}
                      </span>
                    ) : (
                      t("Reference tariff")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}

const pairKey = (p: Pair) => `${p.a.id}:${p.b.id}`;

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "warn" }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "warn" ? "text-warn" : "text-ink"}`}>{value}</p>
      {note ? <p className="mt-0.5 text-xs text-muted">{note}</p> : null}
    </Card>
  );
}
