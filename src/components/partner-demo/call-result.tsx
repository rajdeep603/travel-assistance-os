"use client";

import { useEffect, useState } from "react";
import { Braces, FileText, FolderOpen, Loader2, PhoneForwarded, Sparkles } from "lucide-react";
import type { PortalCopy } from "@/lib/partner-demo/copy";
import { BENEFIT_KIT, type PortalLang } from "@/lib/partner-demo/kit";

interface CallView {
  ref: string;
  scenario: string | null;
  agent: string;
  status: string;
  language: string | null;
  startedAt: string;
  durationSec: number | null;
  ended: boolean;
  summary: string | null;
  transferredTo: string | null;
  transcript: { role: "user" | "agent"; text: string; at: string }[];
  outcome: Record<string, unknown>;
  case: {
    ref: string;
    title: string;
    status: string;
    priority: string;
    location: string;
    patient: string;
    policy: string;
    events: { type: string; title: string; body: string | null; actor: string | null; at: string }[];
  } | null;
  crm: Record<string, unknown> | null;
}

export const fmtDuration = (sec: number | null | undefined) => (sec == null ? "—" : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`);

export function fmtWhen(iso: string, lang: PortalLang) {
  return new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(new Date(iso));
}

function scenarioTitle(id: string | null, lang: PortalLang, fallback: string) {
  return BENEFIT_KIT.scenarios.find((s) => s.id === id)?.title[lang] ?? fallback;
}

/** "Recorded": what the agent's tools saved, in words. */
function recorded(o: Record<string, unknown>, copy: PortalCopy, lang: PortalLang): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const tr = lang === "tr";
  const h = o.hospitalUpdate as Record<string, unknown> | undefined;
  if (h) {
    if (h.admitted != null) out.push({ label: tr ? "Yatış" : "Admitted", value: h.admitted ? (tr ? "Evet" : "Yes") : tr ? "Hayır" : "No" });
    if (h.ward) out.push({ label: tr ? "Servis" : "Ward", value: String(h.ward) });
    if (h.attending_doctor) out.push({ label: tr ? "Sorumlu hekim" : "Attending doctor", value: String(h.attending_doctor) });
    if (h.estimated_cost != null) out.push({ label: tr ? "Tahmini maliyet" : "Estimated cost", value: `${Number(h.estimated_cost).toLocaleString(copy.locale)} ${h.currency ?? ""}`.trim() });
    if (h.report_eta) out.push({ label: tr ? "Rapor" : "Report", value: String(h.report_eta) });
    if (h.guarantee_requested) out.push({ label: tr ? "Garanti talebi" : "Guarantee", value: tr ? "Hastane garanti mektubu istedi" : "The hospital asked for a guarantee letter" });
    if (h.condition_note) out.push({ label: tr ? "Durum notu" : "Condition", value: String(h.condition_note) });
  }
  const handoff = o.handoff as { target?: string; summary?: string } | undefined;
  if (handoff?.target) out.push({ label: copy.result.handoff, value: `${copy.result.handoffTo(handoff.target)}${handoff.summary ? `: ${handoff.summary}` : ""}` });
  const cov = o.coverageChecked as { policy?: string; benefit?: string | null; covered?: boolean | null } | undefined;
  if (cov?.policy) out.push({ label: tr ? "Poliçe kontrolü" : "Policy check", value: `${cov.policy}${cov.benefit ? ` · ${cov.benefit}: ${cov.covered ? (tr ? "teminat var" : "covered") : tr ? "teminat yok" : "not covered"}` : ""}` });
  const apt = o.appointment as { date?: string; time?: string; doctor?: string } | undefined;
  if (o.appointmentRef) out.push({ label: tr ? "Randevu" : "Appointment", value: `${o.appointmentRef}${apt ? ` · ${apt.date ?? ""} ${apt.time ?? ""} · ${apt.doctor ?? ""}` : ""}` });
  if (typeof o.urgency === "string") out.push({ label: copy.result.priority, value: copy.priorities[o.urgency] ?? o.urgency });
  const notes = o.notes as string[] | undefined;
  if (notes?.length) out.push({ label: tr ? "Not" : "Note", value: notes.join(" · ") });
  return out;
}

/** One session's result, fetched until the call is saved and summarised. */
export function CallResult({ token, callRef, copy, lang, compact = false }: { token: string; callRef: string; copy: PortalCopy; lang: PortalLang; compact?: boolean }) {
  const [call, setCall] = useState<CallView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [showTranscript, setShowTranscript] = useState(!compact);
  const r = copy.result;

  useEffect(() => {
    let stopped = false;
    let tries = 0;
    async function load() {
      tries += 1;
      try {
        const res = await fetch(`/api/public/partner-demo/${encodeURIComponent(token)}/calls/${encodeURIComponent(callRef)}`, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error?.message ?? "error");
        if (stopped) return;
        setCall(body.call);
        // The summary is written a few seconds after the call ends.
        if ((!body.call.ended || !body.call.summary) && tries < 15) setTimeout(load, 2000);
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : "error");
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [token, callRef]);

  if (error) return <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>;
  if (!call) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-muted shadow-card">
        <Loader2 size={16} className="animate-spin" aria-hidden /> {r.waiting}
      </div>
    );
  }
  const facts = recorded(call.outcome, copy, lang);
  const waiting = !call.ended || (!call.summary && call.transcript.length > 0);

  return (
    <section aria-label={r.title} className="animate-fade-up space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-ink">
          {r.title} <span className="font-normal tabular-nums text-muted">· {call.ref}</span>
        </h3>
        <p className="text-sm text-muted">
          {scenarioTitle(call.scenario, lang, call.agent)} · {fmtWhen(call.startedAt, lang)} · {r.duration} <span className="tabular-nums">{fmtDuration(call.durationSec)}</span> ·{" "}
          {copy.statuses[call.status] ?? call.status}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-violet-50/60 p-4 ring-1 ring-violet-100">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Sparkles size={16} className="text-ai" aria-hidden /> {r.summary}
          </p>
          {call.summary ? (
            <p className="mt-2 text-[15px] leading-relaxed text-ink">{call.summary}</p>
          ) : waiting ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" aria-hidden /> {r.waiting}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">{r.noSummary}</p>
          )}
          <p className="mt-2 text-xs text-muted">{r.summaryNote}</p>
        </div>

        <div className="rounded-xl bg-canvas p-4 ring-1 ring-line">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <FolderOpen size={16} className="text-brand" aria-hidden /> {r.case}
          </p>
          {call.case ? (
            <>
              <p className="mt-2 text-[15px] font-medium text-ink">
                <span className="tabular-nums">{call.case.ref}</span> · {call.case.title}
              </p>
              <p className="mt-1 text-sm text-muted">
                {r.patient}: {call.case.patient} ({call.case.policy}) · {r.priority}:{" "}
                <span className={call.case.priority === "CRITICAL" ? "font-semibold text-red-700" : "font-medium text-ink"}>{copy.priorities[call.case.priority] ?? call.case.priority}</span> · {r.status}:{" "}
                {copy.caseStatuses[call.case.status] ?? call.case.status}
              </p>
              {call.case.events.length ? (
                <>
                  <p className="mt-3 text-xs font-medium text-muted">{r.timeline}</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {call.case.events.slice(0, compact ? 3 : 5).map((e, i) => (
                      <li key={`${e.at}-${i}`} className="text-sm">
                        <span className="tabular-nums text-muted">{fmtWhen(e.at, lang)}</span> · <span className="text-ink">{e.title}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">{r.noCase}</p>
          )}
        </div>
      </div>

      {facts.length ? (
        <div className="rounded-xl bg-canvas p-4 ring-1 ring-line">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <PhoneForwarded size={16} className="text-brand" aria-hidden /> {r.recorded}
          </p>
          <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
            {facts.map((f) => (
              <div key={f.label + f.value} className="contents">
                <dt className="text-muted">{f.label}</dt>
                <dd className="text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowTranscript((v) => !v)} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:border-brand/40">
          <FileText size={15} aria-hidden /> {r.transcript} ({call.transcript.length})
        </button>
        {call.crm ? (
          <button type="button" onClick={() => setShowJson((v) => !v)} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:border-brand/40">
            <Braces size={15} aria-hidden /> {r.crm}
          </button>
        ) : null}
      </div>

      {showTranscript && call.transcript.length ? (
        <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-xl bg-canvas p-4 ring-1 ring-line">
          {call.transcript.map((m, i) => (
            <p key={i} className="text-[15px] leading-relaxed" dir="auto">
              <span className={`me-2 text-xs font-semibold ${m.role === "user" ? "text-teal-700" : "text-brand"}`}>{m.role === "user" ? copy.tryIt.you : copy.tryIt.agent}</span>
              {m.text}
            </p>
          ))}
        </div>
      ) : null}

      {showJson && call.crm ? (
        <div>
          <p className="mb-2 text-sm text-muted">{r.crmNote}</p>
          <pre className="max-h-[420px] overflow-auto rounded-xl bg-stage p-4 text-xs leading-relaxed text-stage-ink">{JSON.stringify(call.crm, null, 2)}</pre>
        </div>
      ) : null}
    </section>
  );
}
