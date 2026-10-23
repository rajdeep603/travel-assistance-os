"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Handshake, Send } from "lucide-react";
import { Button, Card, ErrorBanner, SectionTitle, StatusBadge, readApiError } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/components/i18n";

interface Partner {
  id: string;
  name: string;
  kind: string;
  country: string;
  regions: string[];
  languages: string[];
}

interface Handoff {
  id: string;
  ref: string;
  status: string;
  scope: string;
  link: string;
  createdAt: string;
  respondBy: string;
  partner: { name: string };
  updates: { at: string; by: string; status: string; note: string; eta?: string | null }[];
}

/**
 * Hand the case to a partner in the network (a federation member or a local
 * correspondent): the pack goes with a secure link where the partner accepts
 * and posts updates, which land on this case's timeline.
 */
export function HandoffCard({ caseId, country, onChanged }: { caseId: string; country: string | null; onChanged: () => void }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const t = useT();

  const load = useCallback(async () => {
    const [p, h] = await Promise.all([
      fetch(`/api/network/partners${country ? `?country=${encodeURIComponent(country)}` : ""}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/cases/${caseId}/handoffs`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ]);
    if (p) {
      setPartners(p.partners);
      setScopes(p.scopes);
      setPartnerId((id) => id || p.partners[0]?.id || "");
      setScope((s) => s || p.scopes[0] || "");
    }
    if (h) setHandoffs(h.handoffs);
  }, [caseId, country]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/handoffs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId, scope }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "The hand-off couldn't be sent."));
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The hand-off couldn't be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* the link is also shown for opening */
    }
  }

  const covers = (p: Partner) => !!country && (p.country === country || p.regions.includes(country));

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Network partners</SectionTitle>
        <Handshake size={16} className="text-muted" aria-hidden />
      </div>
      <p className="mt-1 text-sm text-muted">{t("Hand the case to a partner on the ground. The pack goes with a secure link; their updates arrive on this timeline.")}</p>

      {handoffs.length ? (
        <ul className="mt-3 space-y-3">
          {handoffs.map((h) => (
            <li key={h.id} className="rounded-xl border border-line/70 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">
                  {h.partner.name} <span className="text-xs font-normal tabular-nums text-muted">{h.ref}</span>
                </p>
                <StatusBadge value={h.status} />
              </div>
              <p className="text-xs text-muted">{h.scope} · sent {formatDateTime(h.createdAt)}</p>
              {h.updates.length ? (
                <p className="mt-1.5 text-sm text-ink/85">
                  Latest: {h.updates[h.updates.length - 1].note || h.updates[h.updates.length - 1].status.toLowerCase()}
                  {h.updates[h.updates.length - 1].eta ? ` · next: ${h.updates[h.updates.length - 1].eta}` : ""}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <a href={h.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                  <ExternalLink size={12} aria-hidden /> Partner&apos;s view
                </a>
                <button type="button" onClick={() => void copy(h.link)} className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink">
                  <Copy size={12} aria-hidden /> {copied === h.link ? "Copied" : "Copy link"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{t("Partner")}</span>
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.country}
                {covers(p) ? " (covers this country)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{t("What they should do")}</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            {scopes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      {error ? <div className="mt-3"><ErrorBanner message={error} /></div> : null}
      <div className="mt-3">
        <Button variant="secondary" onClick={() => void send()} busy={busy} disabled={!partnerId || !scope}>
          <Send size={15} aria-hidden /> {t("Hand off with the case pack")}
        </Button>
      </div>
    </Card>
  );
}
