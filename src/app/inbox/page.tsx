"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Printer, Sparkles } from "lucide-react";
import { MessageDetailPanel } from "@/components/inbox/message-detail";
import { AIPipeline } from "@/components/ai-progress";
import { Button, Card, EmptyState, ErrorBanner, PageHeader, SectionTitle, SkeletonRows, StatusBadge, readApiError } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

interface Row {
  id: string;
  ref: string;
  channel: "EMAIL" | "FAX";
  fromAddress: string;
  subject: string | null;
  summary: string | null;
  status: string;
  receivedAt: string;
  riskFlags: string[];
  matchedCase: { id: string; ref: string } | null;
  _count: { documents: number; replies: number };
}

interface Samples {
  emails: { id: string; label: string }[];
  faxes: { id: string; label: string }[];
}

const STAGES = ["Reading attachments (OCR for scans)", "Classifying and extracting", "Matching the case", "Filing and replying"];

export default function InboxPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [samples, setSamples] = useState<Samples | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sample, setSample] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox");
      if (!res.ok) throw new Error();
      const list: Row[] = (await res.json()).messages;
      setRows(list);
      setSelected((cur) => cur ?? list[0]?.id ?? null);
    } catch {
      setError("The inbox could not be loaded — please refresh.");
    }
  }, []);

  useEffect(() => {
    void load();
    fetch("/api/inbox/simulate")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Samples | null) => {
        setSamples(s);
        if (s?.emails[0]) setSample(`email:${s.emails[0].id}`);
      })
      .catch(() => undefined);
  }, [load]);

  async function simulate() {
    const [kind, id] = sample.split(":");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, sample: id }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The sample could not be processed."));
        return;
      }
      const { message } = await res.json();
      await load();
      setSelected(message.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Inbox — e-mail & fax automation"
        subtitle="Claims and hospital correspondence arrive here: AI reads every attachment (OCR for faxes and handwriting), matches the case, files claims and answers travellers — humans review anything risky."
      />
      {error ? (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <Card className="mb-5">
        <SectionTitle>Try it with a fictional message</SectionTitle>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            aria-label="Sample message"
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            className="min-w-[280px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <optgroup label="E-mails">
              {samples?.emails.map((e) => (
                <option key={e.id} value={`email:${e.id}`}>
                  {e.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Faxes">
              {samples?.faxes.map((f) => (
                <option key={f.id} value={`fax:${f.id}`}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          </select>
          <Button onClick={() => void simulate()} busy={busy} disabled={!sample}>
            <Sparkles size={15} aria-hidden /> Receive it
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Runs the same pipeline as the live e-mail (SendGrid Inbound Parse) and fax webhooks.
        </p>
        {busy ? (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <AIPipeline busy stages={STAGES} />
          </div>
        ) : null}
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <SectionTitle>Messages</SectionTitle>
          {rows === null ? (
            <div className="mt-3">
              <SkeletonRows rows={5} />
            </div>
          ) : rows.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Inbox is empty" hint="Receive a sample above, or connect SendGrid Inbound Parse." />
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.id)}
                    aria-current={selected === r.id}
                    className={`w-full px-2 py-2.5 text-left transition-colors ${selected === r.id ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-800">
                        {r.channel === "FAX" ? <Printer size={14} className="shrink-0 text-slate-400" aria-hidden /> : <Mail size={14} className="shrink-0 text-slate-400" aria-hidden />}
                        <span className="truncate">{r.subject ?? r.fromAddress}</span>
                      </span>
                      <StatusBadge value={r.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {r.ref} · {formatDateTime(r.receivedAt)}
                      {r.matchedCase ? ` · ${r.matchedCase.ref}` : ""}
                      {r.riskFlags.length ? ` · ⚠ ${r.riskFlags[0]}` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="lg:col-span-3">
          {selected ? (
            <MessageDetailPanel id={selected} onChanged={() => void load()} />
          ) : (
            <EmptyState title="Select a message" />
          )}
        </div>
      </div>
    </div>
  );
}
