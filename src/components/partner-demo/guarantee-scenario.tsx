"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileDown, FileText, Loader2, Mail, Play, RotateCcw, ScanText, Scale, ShieldCheck } from "lucide-react";
import type { PortalCopy } from "@/lib/partner-demo/copy";
import type { PortalLang } from "@/lib/partner-demo/kit";
import { fmtWhen } from "@/components/partner-demo/call-result";

interface Finding {
  line: number | null;
  rule: string;
  reason: string;
  saving: number;
}
interface Run {
  receivedAt: string;
  email: { ref: string; from: string; subject: string | null; body: string | null } | null;
  estimate: {
    documentId: string;
    filename: string;
    read: {
      patientName: string | null;
      dateOfBirth: string | null;
      policyReference: string | null;
      hospital: string | null;
      doctor: string | null;
      diagnosis: string | null;
      procedures: string[];
      admissionDate: string | null;
      amount: number | null;
      currency: string | null;
    } | null;
  };
  matchedCase: string;
  review: { billed: number; recommended: number; result: { lines?: { description: string; billed: number; covered: boolean }[]; findings?: Finding[]; notCovered?: number } } | null;
  letter: {
    ref: string;
    status: string;
    hospital: string;
    estimated: number;
    guaranteed: number;
    excess: number;
    currency: string;
    conditions: string[];
    flags: string[];
    validUntil: string;
    approvedBy: string | null;
    sentAt: string | null;
    trace: {
      computation?: { estimateEur?: number; remainingMedicalLimitEur?: number; benefitLimitEur?: number | null; excessEur?: number; guaranteedEur?: number; notCoveredEur?: number; rule?: string };
      benchmark?: { label: string; lowEur: number; highEur: number; position: string };
    } | null;
    pdfDocumentId: string | null;
  };
}

export function GuaranteeScenario({ token, copy, lang }: { token: string; copy: PortalCopy; lang: PortalLang }) {
  const g = copy.guarantee;
  const api = `/api/public/partner-demo/${encodeURIComponent(token)}`;
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const money = (n: number, ccy = "EUR") => new Intl.NumberFormat(copy.locale, { style: "currency", currency: ccy, maximumFractionDigits: 2 }).format(n);

  const load = useCallback(async () => {
    const res = await fetch(`${api}/guarantee`, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (res.ok) setRun(body.run);
  }, [api]);
  useEffect(() => {
    void load();
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [load]);

  async function go() {
    setBusy(true);
    setError(null);
    setStep(0);
    // The pipeline answers in a few seconds; the trail moves on while it works and completes with the answer.
    timer.current = window.setInterval(() => setStep((s) => Math.min(3, s + 1)), 900);
    try {
      const res = await fetch(`${api}/guarantee`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "error");
      setRun(body.run);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
      setStep(-1);
    } finally {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      setBusy(false);
    }
  }

  const read = run?.estimate.read;
  const comp = run?.letter.trace?.computation;
  const bench = run?.letter.trace?.benchmark;
  const lines = run?.review?.result.lines ?? [];
  const findings = (run?.review?.result.findings ?? []).filter((f) => f.rule !== "NO_REFERENCE");
  const notCoveredLines = lines.filter((l) => !l.covered);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void go()}
          disabled={busy}
          className="inline-flex h-12 items-center gap-2.5 rounded-full bg-brand bg-brand-gradient px-6 text-base font-semibold text-white shadow-glow transition-transform duration-150 enabled:active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : run ? <RotateCcw size={18} aria-hidden /> : <Play size={18} aria-hidden />}
          {busy ? g.running : run ? g.runAgain : g.run}
        </button>
        <p className="text-sm text-muted">{copy.tryIt.noMinutes}</p>
      </div>

      {step >= 0 ? (
        <ol className="grid gap-2 sm:grid-cols-5" aria-live="polite">
          {g.steps.map((label, i) => {
            const done = step > i || step === 4;
            const active = step === i && busy;
            return (
              <li key={label} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 transition-colors duration-250 ${done ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : active ? "bg-violet-50 text-violet-800 ring-violet-200" : "bg-surface text-muted ring-line"}`}>
                {done ? <CheckCircle2 size={15} aria-hidden /> : active ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <span className="h-[15px] w-[15px] rounded-full ring-1 ring-current" aria-hidden />}
                {label}
              </li>
            );
          })}
        </ol>
      ) : null}

      {error ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p> : null}

      {run && !busy ? (
        <div className="animate-fade-up grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            {run.email ? (
              <Panel icon={<Mail size={16} className="text-blue-600" aria-hidden />} title={g.email}>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted">{g.from}</dt>
                  <dd className="break-words text-ink">{run.email.from}</dd>
                  <dt className="text-muted">{g.subject}</dt>
                  <dd className="text-ink">{run.email.subject}</dd>
                  <dt className="text-muted">{g.attachment}</dt>
                  <dd className="text-ink">{run.estimate.filename}</dd>
                </dl>
                {run.email.body ? <p className="mt-3 whitespace-pre-line rounded-xl bg-canvas p-3 text-sm leading-relaxed text-ink">{run.email.body}</p> : null}
                <a href={`/api/public/partner-demo/${encodeURIComponent(token)}/documents/${run.estimate.documentId}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">
                  <FileText size={15} aria-hidden /> {g.openEstimate}
                </a>
              </Panel>
            ) : null}

            {read ? (
              <Panel icon={<ScanText size={16} className="text-ai" aria-hidden />} title={g.read}>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  {(
                    [
                      ["patientName", read.patientName],
                      ["dateOfBirth", read.dateOfBirth],
                      ["policyReference", read.policyReference],
                      ["hospital", read.hospital],
                      ["doctor", read.doctor],
                      ["diagnosis", read.diagnosis],
                      ["procedures", read.procedures.join("; ")],
                      ["admissionDate", read.admissionDate],
                      ["amount", read.amount != null ? money(read.amount, read.currency ?? "EUR") : null],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{g.fields[k]}</dt>
                      <dd className="text-ink">{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-muted">{g.readNote}</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 size={15} aria-hidden /> {g.matched(run.matchedCase)}
                </p>
              </Panel>
            ) : null}
          </div>

          <div className="space-y-5">
            <Panel icon={<Scale size={16} className="text-brand" aria-hidden />} title={g.decision}>
              {comp ? (
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-muted">{g.estimate}</dt>
                  <dd className="text-end tabular-nums text-ink">{money(run.letter.estimated, run.letter.currency)}</dd>
                  {comp.notCoveredEur ? (
                    <>
                      <dt className="text-muted">
                        {g.notCovered}
                        {notCoveredLines.length ? <span className="block text-xs">{notCoveredLines.map((l) => l.description).join("; ")}</span> : null}
                      </dt>
                      <dd className="text-end tabular-nums text-warn">−{money(comp.notCoveredEur)}</dd>
                    </>
                  ) : null}
                  {comp.remainingMedicalLimitEur != null ? (
                    <>
                      <dt className="text-muted">{g.remaining}</dt>
                      <dd className="text-end tabular-nums text-ink">{money(comp.remainingMedicalLimitEur)}</dd>
                    </>
                  ) : null}
                  {comp.benefitLimitEur != null ? (
                    <>
                      <dt className="text-muted">{g.benefitLimit}</dt>
                      <dd className="text-end tabular-nums text-ink">{money(comp.benefitLimitEur)}</dd>
                    </>
                  ) : null}
                  <dt className="text-muted">{g.excess}</dt>
                  <dd className="text-end tabular-nums text-ink">{money(comp.excessEur ?? 0)}</dd>
                  <dt className="border-t border-line pt-1.5 font-semibold text-ink">{g.guaranteed}</dt>
                  <dd className="border-t border-line pt-1.5 text-end text-base font-bold tabular-nums text-brand">{money(run.letter.guaranteed, run.letter.currency)}</dd>
                </dl>
              ) : null}
              {comp?.rule ? (
                <p className="mt-3 rounded-lg bg-canvas px-3 py-2 font-mono text-xs text-ink">
                  {g.rule}: {comp.rule}
                </p>
              ) : null}
              {bench && bench.position === "within" ? <p className="mt-3 text-sm text-ink">{g.benchmarkWithin(bench.label, money(bench.lowEur), money(bench.highEur))}</p> : null}
              {run.letter.flags.length ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <p className="flex items-center gap-2 font-medium">
                    <AlertTriangle size={15} aria-hidden /> {g.human}
                  </p>
                  <ul className="mt-1 list-disc ps-5">
                    {run.letter.flags.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 flex items-start gap-2 text-sm font-medium text-emerald-700">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden /> {g.auto}
                </p>
              )}
              {findings.length ? (
                <div className="mt-4">
                  <p className="text-xs font-medium text-muted">{g.review}</p>
                  <ul className="mt-1.5 space-y-1 text-sm text-ink">
                    {findings.map((f, i) => (
                      <li key={i}>
                        {f.line != null && lines[f.line] ? <span className="font-medium">{lines[f.line].description}: </span> : null}
                        {f.reason}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-muted">{g.reviewNote}</p>
                </div>
              ) : null}
            </Panel>

            <Panel icon={<ShieldCheck size={16} className="text-emerald-600" aria-hidden />} title={`${g.letter} · ${run.letter.ref}`}>
              <p className="text-sm text-ink">
                <span className="font-semibold">{g.status[run.letter.status] ?? run.letter.status}</span> · {run.letter.hospital}
              </p>
              <p className="mt-1 text-sm text-muted">
                {g.guaranteed}: <span className="font-semibold tabular-nums text-ink">{money(run.letter.guaranteed, run.letter.currency)}</span> · {g.validUntil}:{" "}
                {new Intl.DateTimeFormat(copy.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date(run.letter.validUntil))}
              </p>
              {run.letter.sentAt ? (
                <p className="mt-1 text-sm text-muted">
                  {g.sent} · {fmtWhen(run.letter.sentAt, lang)}
                </p>
              ) : null}
              {run.letter.conditions.length ? (
                <>
                  <p className="mt-3 text-xs font-medium text-muted">{g.conditions}</p>
                  <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm text-ink">
                    {run.letter.conditions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {run.letter.pdfDocumentId ? (
                <a
                  href={`/api/public/partner-demo/${encodeURIComponent(token)}/documents/${run.letter.pdfDocumentId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow hover:bg-brand-deep"
                >
                  <FileDown size={16} aria-hidden /> {g.openLetter}
                </a>
              ) : null}
              <p className="mt-3 text-xs text-muted">{g.letterNote}</p>
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}
