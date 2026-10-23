"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, FileText, Send, ShieldCheck, XCircle } from "lucide-react";
import { Button, Card, ErrorBanner, StatusBadge } from "@/components/ui";
import { formatDateTime, formatMoneyExact } from "@/lib/format";

interface Pack {
  caseRef: string;
  title: string;
  summary: string;
  location: string;
  priority: string;
  patient: { name: string; dateOfBirth: string; nationality: string; language: string; phone: string };
  policy: { number: string; plan: string; currency: string; remaining: number } | null;
  guarantee: { ref: string; amount: number; currency: string; status: string; hospital: string } | null;
  documents: { name: string; kind: string }[];
  instructions: string[];
  contact: string;
}

interface Handoff {
  ref: string;
  status: string;
  scope: string;
  pack: Pack;
  respondBy: string;
  partner: { name: string };
  updates: { at: string; by: string; status: string; note: string; eta?: string | null }[];
}

/** A partner's view of a case handed to it, behind a secure link: accept, decline, post updates. */
export default function PartnerHandoffPage({ params }: { params: { token: string } }) {
  const api = `/api/public/handoffs/${encodeURIComponent(params.token)}`;
  const [h, setH] = useState<Handoff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [eta, setEta] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(api, { cache: "no-store" });
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error(body?.error?.message ?? "This link can't be opened.");
    setH(body.handoff);
  }, [api]);

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  async function respond(action: "ACCEPT" | "DECLINE" | "UPDATE" | "COMPLETE") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note || undefined, eta: eta || undefined, name: name || undefined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "That didn't go through. Please try again.");
      setNote("");
      setEta("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!h) {
    return <div className="mx-auto max-w-2xl">{error ? <ErrorBanner message={error} /> : <Card className="p-7 text-sm text-slate-500">Opening the case…</Card>}</div>;
  }
  const p = h.pack;
  const open = h.status !== "DECLINED" && h.status !== "COMPLETED";
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs tabular-nums text-slate-500">{h.ref} · case {p.caseRef} · for {h.partner.name}</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">{p.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{p.location} · priority {p.priority.toLowerCase()}</p>
          </div>
          <StatusBadge value={h.status} />
        </div>
        <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">We ask: {h.scope}</p>
        {h.status === "SENT" ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
            <Clock size={13} aria-hidden /> Please answer by {formatDateTime(h.respondBy)}
          </p>
        ) : null}
        <p className="mt-4 text-sm leading-relaxed text-slate-700">{p.summary}</p>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-500">Patient</dt>
            <dd className="text-slate-800">
              {p.patient.name}, born {p.patient.dateOfBirth}
              <span className="block text-xs text-slate-500">{p.patient.nationality} · speaks {p.patient.language} · {p.patient.phone}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Policy</dt>
            <dd className="text-slate-800">
              {p.policy ? `${p.policy.number}, ${p.policy.plan}` : "—"}
              {p.policy ? <span className="block text-xs text-slate-500">Remaining medical limit {formatMoneyExact(p.policy.remaining, p.policy.currency)}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Guarantee of payment</dt>
            <dd className="text-slate-800">
              {p.guarantee ? `${p.guarantee.ref}: ${formatMoneyExact(p.guarantee.amount, p.guarantee.currency)}` : "None yet: ask us before costs are incurred"}
              {p.guarantee ? <span className="block text-xs text-slate-500">{p.guarantee.hospital} · {p.guarantee.status.toLowerCase()}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Documents on file</dt>
            <dd className="space-y-0.5 text-slate-800">
              {p.documents.length ? (
                p.documents.map((d) => (
                  <span key={d.name} className="flex items-center gap-1.5 text-xs">
                    <FileText size={12} className="text-slate-400" aria-hidden /> {d.name}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">None yet</span>
              )}
            </dd>
          </div>
        </dl>

        <ul className="mt-5 space-y-1 text-sm text-slate-700">
          {p.instructions.map((i) => (
            <li key={i} className="flex gap-2">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden /> {i}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">Questions: {p.contact}</p>
      </Card>

      {error ? <ErrorBanner message={error} /> : null}

      {open ? (
        <Card className="p-6">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:text-sm" />
          </label>
          {h.status === "SENT" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => respond("ACCEPT")} busy={busy === "ACCEPT"}>
                <CheckCircle2 size={15} aria-hidden /> Accept the case
              </Button>
              <Button variant="secondary" onClick={() => respond("DECLINE")} busy={busy === "DECLINE"}>
                <XCircle size={15} aria-hidden /> Decline
              </Button>
            </div>
          ) : (
            <>
              <label className="mt-4 block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Update for the assistance desk</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Visited the patient at 14:00: stable, CT clear, discharge planned tomorrow."
                  className="w-full rounded-lg border border-slate-300 p-3 text-base sm:text-sm"
                />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Next step and when (optional)</span>
                <input value={eta} onChange={(e) => setEta(e.target.value)} placeholder="Ambulance to the airport, Sat 09:30" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:text-sm" />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => respond("UPDATE")} busy={busy === "UPDATE"} disabled={note.trim().length < 3}>
                  <Send size={15} aria-hidden /> Post the update
                </Button>
                <Button variant="success" onClick={() => respond("COMPLETE")} busy={busy === "COMPLETE"}>
                  <CheckCircle2 size={15} aria-hidden /> Work completed
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : null}

      {h.updates.length ? (
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-slate-900">Updates</h2>
          <ol className="mt-3 space-y-3">
            {[...h.updates].reverse().map((u, i) => (
              <li key={i} className="text-sm">
                <p className="text-slate-800">
                  <span className="font-medium">{u.status.replace(/_/g, " ").toLowerCase()}</span>
                  {u.note ? `: ${u.note}` : ""}
                  {u.eta ? ` · next: ${u.eta}` : ""}
                </p>
                <p className="text-xs text-slate-500">{formatDateTime(u.at)} · {u.by.replace(/^partner:/, "")}</p>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}
