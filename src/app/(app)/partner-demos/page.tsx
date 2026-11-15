"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Ban, Copy, ExternalLink, KeyRound, RotateCcw, Timer } from "lucide-react";
import { Button, Card, ErrorBanner, PageHeader, SectionTitle, SkeletonRows, readApiError } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

// Private demo portals for prospects (a partner's CTO studying the product
// before a partnership call): the link to send, its expiry and voice budget,
// and the usage log to read before the follow-up call.

interface Usage {
  budgetSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  active: number;
  sessions: number;
}
interface PortalRow {
  id: string;
  token: string;
  kit: string;
  company: string;
  contactName: string;
  contactEmail: string;
  emailDomain: string | null;
  hostContact: string | null;
  expiresAt: string;
  state: "open" | "expired" | "revoked";
  minuteBudget: number;
  sessionSeconds: number;
  usage: Usage;
  events: number;
  lastEvent: { type: string; viewer: string | null; at: string } | null;
}
interface Detail {
  events: { id: string; type: string; viewer: string | null; detail: Record<string, unknown> | null; at: string }[];
  calls: { ref: string; scenario: string | null; agent: string; status: string; startedAt: string; durationSec: number | null }[];
}

const FIELD = "mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";
const LABEL = "block text-xs font-medium text-muted";
const minutes = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const EVENT_LABELS: Record<string, string> = {
  OPENED: "Opened the link",
  ACKNOWLEDGED: "Acknowledged confidentiality",
  ACKNOWLEDGE_REFUSED: "Tried an e-mail outside the domain",
  SECTION: "Viewed a section",
  SCENARIO: "Picked a scenario",
  SESSION_STARTED: "Started a voice session",
  SESSION_REFUSED: "Session refused",
  GOP_RUN: "Ran the guarantee scenario",
  DOCUMENT: "Opened a PDF",
  REVOKED: "Link withdrawn",
  RESTORED: "Link restored",
  UPDATED: "Settings changed",
};

function linkOf(token: string) {
  return `${window.location.origin}/partner-demo/${token}`;
}

export default function PartnerDemosPage() {
  const [portals, setPortals] = useState<PortalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState({
    kit: "benefit",
    company: "Benefit Global Assistance",
    contactName: "Erdener Güngör",
    contactEmail: "",
    emailDomain: "benefitcodes.com",
    hostContact: "",
    expiresAt: "2026-12-04",
    minuteBudget: 60,
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/partner-demos", { cache: "no-store" });
    if (!res.ok) return setError(await readApiError(res, "The demo portals could not be loaded."));
    const body = await res.json();
    setPortals(body.portals);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return setDetail(null);
    fetch(`/api/partner-demos/${selected}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setDetail({ events: b.events, calls: b.calls }))
      .catch(() => undefined);
  }, [selected, portals]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner-demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, hostContact: form.hostContact || undefined, emailDomain: form.emailDomain || undefined }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "The portal could not be created."));
      const body = await res.json();
      await load();
      setSelected(body.portal.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The portal could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "revoke" | "restore") {
    const res = await fetch(`/api/partner-demos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!res.ok) return setError(await readApiError(res, "That didn't go through."));
    await load();
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(linkOf(token)).catch(() => undefined);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Partner demos"
        subtitle="Private, time-limited demo portals for prospects: fixed scenarios in their language, a voice-minute budget, a confidentiality acknowledgement and a log of what they opened."
      />
      {error ? (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          {!portals ? (
            <Card className="p-5">
              <SkeletonRows rows={3} />
            </Card>
          ) : portals.length === 0 ? (
            <Card className="p-5 text-sm text-muted">No demo portals yet. Create one on the right.</Card>
          ) : (
            portals.map((p) => (
              <Card key={p.id} className={`p-5 ${selected === p.id ? "ring-2 ring-brand/40" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button type="button" onClick={() => setSelected(selected === p.id ? null : p.id)} className="min-w-0 text-start">
                    <p className="text-base font-semibold text-ink">{p.company}</p>
                    <p className="text-sm text-muted">
                      {p.contactName} · {p.contactEmail}
                      {p.emailDomain ? ` · any @${p.emailDomain}` : ""}
                    </p>
                  </button>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${p.state === "open" ? "bg-emerald-50 text-emerald-700" : p.state === "revoked" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {p.state === "open" ? `Open until ${formatDateTime(p.expiresAt)}` : p.state === "revoked" ? "Withdrawn" : "Expired"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink">
                  <span className="inline-flex items-center gap-1.5">
                    <Timer size={14} className="text-brand" aria-hidden />
                    <span className="tabular-nums">
                      {minutes(p.usage.usedSeconds)} of {p.minuteBudget}:00 used
                    </span>
                  </span>
                  <span>
                    {p.usage.sessions} session{p.usage.sessions === 1 ? "" : "s"}
                    {p.usage.active ? `, ${p.usage.active} live` : ""}
                  </span>
                  <span className="text-muted">
                    {p.lastEvent ? `Last: ${EVENT_LABELS[p.lastEvent.type] ?? p.lastEvent.type}${p.lastEvent.viewer ? ` (${p.lastEvent.viewer})` : ""}, ${formatDateTime(p.lastEvent.at)}` : "Not opened yet"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void copyLink(p.token)}>
                    <Copy size={14} aria-hidden /> {copied === p.token ? "Copied" : "Copy link"}
                  </Button>
                  <a href={`/partner-demo/${p.token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-brand/40">
                    <ExternalLink size={14} aria-hidden /> Open
                  </a>
                  {p.state === "revoked" ? (
                    <Button variant="secondary" onClick={() => void act(p.id, "restore")}>
                      <RotateCcw size={14} aria-hidden /> Restore
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => void act(p.id, "revoke")}>
                      <Ban size={14} aria-hidden /> Withdraw
                    </Button>
                  )}
                </div>

                {selected === p.id && detail ? (
                  <div className="mt-5 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
                    <div>
                      <SectionTitle>Sessions</SectionTitle>
                      {detail.calls.length === 0 ? <p className="text-sm text-muted">None yet.</p> : null}
                      <ul className="space-y-1.5 text-sm">
                        {detail.calls.map((c) => (
                          <li key={c.ref}>
                            <span className="tabular-nums font-medium text-ink">{c.ref}</span> · {c.scenario ?? c.agent} · <span className="tabular-nums">{c.durationSec != null ? minutes(c.durationSec) : "—"}</span> · {c.status.toLowerCase()}
                            <span className="block text-xs text-muted">{formatDateTime(c.startedAt)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <SectionTitle>Usage log</SectionTitle>
                      <ul className="max-h-[360px] space-y-1.5 overflow-y-auto text-sm">
                        {detail.events.map((e) => (
                          <li key={e.id}>
                            <span className="text-ink">{EVENT_LABELS[e.type] ?? e.type}</span>
                            {e.detail && typeof e.detail.value === "string" ? <span className="text-ink">: {e.detail.value}</span> : null}
                            {e.detail && typeof e.detail.scenario === "string" ? <span className="text-ink">: {e.detail.scenario}</span> : null}
                            {e.detail && typeof e.detail.reason === "string" ? <span className="text-ink"> ({e.detail.reason})</span> : null}
                            {e.detail && typeof e.detail.name === "string" ? <span className="text-ink">: {e.detail.name}</span> : null}
                            <span className="block text-xs text-muted">
                              {formatDateTime(e.at)}
                              {e.viewer ? ` · ${e.viewer}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </Card>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          <Card className="p-5 lg:sticky lg:top-20">
            <SectionTitle>New demo portal</SectionTitle>
            <form onSubmit={create} className="mt-3 space-y-3">
              <div>
                <label className={LABEL}>
                  Company
                  <input className={FIELD} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className={LABEL}>
                  Contact name
                  <input className={FIELD} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} required />
                </label>
                <label className={LABEL}>
                  Contact e-mail
                  <input className={FIELD} type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} required />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className={LABEL}>
                  Also allow any e-mail at
                  <input className={FIELD} value={form.emailDomain} onChange={(e) => setForm({ ...form, emailDomain: e.target.value })} placeholder="benefitcodes.com" />
                </label>
                <label className={LABEL}>
                  Expires (end of day, Istanbul)
                  <input className={FIELD} type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} required />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className={LABEL}>
                  Voice minutes in total
                  <input className={FIELD} type="number" min={5} max={600} value={form.minuteBudget} onChange={(e) => setForm({ ...form, minuteBudget: Number(e.target.value) })} />
                </label>
                <label className={LABEL}>
                  Demo kit
                  <select className={FIELD} value={form.kit} onChange={(e) => setForm({ ...form, kit: e.target.value })}>
                    <option value="benefit">Benefit Global Assistance (Turkish)</option>
                  </select>
                </label>
              </div>
              <label className={LABEL}>
                Contact line shown in the portal
                <input className={FIELD} value={form.hostContact} onChange={(e) => setForm({ ...form, hostContact: e.target.value })} placeholder="Rajdeep Shah · e-mail · WhatsApp" />
              </label>
              <p className="text-xs text-muted">Sessions are capped at 5 minutes each and 2 at a time. Browser voice only: no phone calls from the portal.</p>
              <Button type="submit" disabled={busy}>
                <KeyRound size={14} aria-hidden /> Create the link
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
