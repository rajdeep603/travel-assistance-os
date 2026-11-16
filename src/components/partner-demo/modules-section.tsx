"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
  FileText,
  FolderCheck,
  Inbox,
  Languages,
  Loader2,
  Mail,
  MessageCircle,
  Play,
  Printer,
  ReceiptText,
  RotateCcw,
  Scale,
  ScanText,
  ShieldAlert,
  Send,
  XCircle,
} from "lucide-react";
import { SectionHeading } from "@/components/partner-demo/sections";
import type { PortalCopy } from "@/lib/partner-demo/copy";
import type { DocumentSampleCard, InboxSampleCard, ModuleId, PortalKit, PortalLang } from "@/lib/partner-demo/kit";

// ---- Shapes from the portal's module APIs (src/lib/partner-demo/modules.ts) ----

interface Read {
  patientName: string | null;
  dateOfBirth: string | null;
  policyReference: string | null;
  hospital: string | null;
  doctor: string | null;
  diagnosis: string | null;
  symptoms: string[];
  procedures: string[];
  medications: string[];
  admissionDate: string | null;
  dischargeDate: string | null;
  amount: number | null;
  currency: string | null;
  summary: string | null;
  missingInfo: string[];
  confidence: number | null;
}
interface DocView {
  id: string;
  filename: string;
  kind: string;
  status: string;
  error: string | null;
  ocr: boolean;
  language: string | null;
  original: string | null;
  english: string | null;
  read: Read | null;
}
interface InboxRun {
  sample: string;
  ref: string;
  channel: string;
  from: string;
  subject: string | null;
  body: string | null;
  receivedAt: string;
  language: string | null;
  english: string | null;
  status: string;
  summary: string | null;
  riskFlags: string[];
  matchedCase: { ref: string; title: string; confidence: number | null; reasons: string[] } | null;
  documents: DocView[];
  replies: { channel: string; to: string; subject: string | null; body: string; status: string; automatic: boolean }[];
}
interface Settlement {
  currency: string;
  billed: number;
  notCovered: number;
  aboveReference: number;
  allowed: number;
  excess: number;
  overLimit: number;
  payable: number;
  travellerPays: number;
  lines: { invoice: string; code: string | null; description: string; billed: number; allowed: number; remarks: string[] }[];
  reasons: string[];
  checks: { label: string; ok: boolean }[];
  attention: string[];
}
interface ClaimView {
  ref: string;
  status: string;
  patient: string;
  policy: { number: string; plan: string } | null;
  summary: string | null;
  amount: number | null;
  currency: string | null;
  issues: { severity: string; message: string }[];
  signals: { code: string; level: string; reason: string }[];
  documents: DocView[];
  settlement: Settlement | null;
}

const MODULES: ModuleId[] = ["inbox", "documents", "claims"];
const MODULE_ICONS: Record<ModuleId, typeof Inbox> = { inbox: Inbox, documents: Languages, claims: ReceiptText };
const MODULE_TONES: Record<ModuleId, string> = {
  inbox: "bg-sky-50 text-sky-600",
  documents: "bg-teal-50 text-teal-600",
  claims: "bg-orange-50 text-orange-600",
};
const CHANNEL_ICONS: Record<string, typeof Mail> = { email: Mail, fax: Printer, whatsapp: MessageCircle, EMAIL: Mail, FAX: Printer, WHATSAPP: MessageCircle };
const RTL = new Set(["ar", "fa", "ur", "he"]);

export function ModulesSection({ token, kit, copy, lang }: { token: string; kit: PortalKit; copy: PortalCopy; lang: PortalLang }) {
  const m = copy.modules;
  const api = `/api/public/partner-demo/${encodeURIComponent(token)}`;
  const [moduleId, setModuleId] = useState<ModuleId>(() => {
    if (typeof window === "undefined") return "inbox";
    const q = new URLSearchParams(window.location.search).get("module");
    return MODULES.includes(q as ModuleId) ? (q as ModuleId) : "inbox";
  });
  useEffect(() => {
    void fetch(`${api}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "MODULE", value: moduleId }) }).catch(() => undefined);
    const params = new URLSearchParams(window.location.search);
    params.set("module", moduleId);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}${window.location.hash}`);
  }, [moduleId, api]);

  return (
    <div className="space-y-5">
      <SectionHeading title={m.title} intro={m.intro} />
      <div role="tablist" aria-label={m.title} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {MODULES.map((id) => {
          const Icon = MODULE_ICONS[id];
          const selected = id === moduleId;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setModuleId(id)}
              className={`flex gap-3 rounded-2xl p-4 text-start shadow-card ring-1 transition-colors duration-150 ${selected ? "bg-brand/[0.07] ring-2 ring-brand/50" : "bg-surface ring-line hover:ring-brand/30"}`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${MODULE_TONES[id]}`}>
                <Icon size={18} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-snug text-ink">{m.tabs[id]}</span>
                <span className="mt-1 block text-xs leading-snug text-muted">{m.taglines[id]}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="max-w-4xl text-[15px] leading-relaxed text-ink">{m.summaries[moduleId]}</p>
      {moduleId === "inbox" ? (
        <InboxModule key="inbox" api={api} samples={kit.modules.inbox} copy={copy} lang={lang} />
      ) : moduleId === "documents" ? (
        <DocumentsModule key="documents" api={api} samples={kit.modules.documents} copy={copy} lang={lang} />
      ) : (
        <ClaimsModule key="claims" api={api} copy={copy} lang={lang} />
      )}
      <p className="text-xs text-muted">{m.sampleNote}</p>
    </div>
  );
}

// ---- Running a sample ---------------------------------------------------------

/** POSTs a run; the trail moves on while the pipeline works and completes with the answer. */
function useRun<T>(steps: number) {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
    },
    []
  );
  const run = useCallback(
    async (url: string, body: unknown, pick: (json: Record<string, unknown>) => T): Promise<T | null> => {
      setBusy(true);
      setError(null);
      setStep(0);
      timer.current = window.setInterval(() => setStep((s) => Math.min(steps - 1, s + 1)), 800);
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error?.message ?? "error");
        setStep(steps);
        return pick(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "error");
        setStep(-1);
        return null;
      } finally {
        if (timer.current) window.clearInterval(timer.current);
        timer.current = null;
        setBusy(false);
      }
    },
    [steps]
  );
  return { busy, step, error, run };
}

function RunButton({ busy, done, labels, onClick }: { busy: boolean; done: boolean; labels: [string, string, string]; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex h-12 items-center gap-2.5 rounded-full bg-brand bg-brand-gradient px-6 text-base font-semibold text-white shadow-glow transition-transform duration-150 enabled:active:scale-[0.98] disabled:opacity-60"
    >
      {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : done ? <RotateCcw size={18} aria-hidden /> : <Play size={18} aria-hidden />}
      {busy ? labels[2] : done ? labels[1] : labels[0]}
    </button>
  );
}

function Trail({ steps, step, busy }: { steps: string[]; step: number; busy: boolean }) {
  if (step < 0) return null;
  return (
    <ol className={`grid gap-2 ${steps.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`} aria-live="polite">
      {steps.map((label, i) => {
        const done = step > i || step >= steps.length;
        const active = step === i && busy;
        return (
          <li
            key={label}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 transition-colors duration-250 ${done ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : active ? "bg-violet-50 text-violet-800 ring-violet-200" : "bg-surface text-muted ring-line"}`}
          >
            {done ? <CheckCircle2 size={15} aria-hidden /> : active ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <span className="h-[15px] w-[15px] rounded-full ring-1 ring-current" aria-hidden />}
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function Panel({ icon, title, children, className = "" }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-card ${className}`}>
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

function Chip({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "ok" | "warn" | "info" }) {
  const tones = {
    plain: "bg-canvas text-ink ring-line",
    ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    warn: "bg-amber-50 text-amber-800 ring-amber-200",
    info: "bg-sky-50 text-sky-800 ring-sky-200",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}>{children}</span>;
}

/** Sample cards to choose from (radio group). */
function SampleChooser<T>({
  items,
  selected,
  onSelect,
  keyOf,
  render,
  label,
}: {
  items: T[];
  selected: string;
  onSelect: (key: string) => void;
  keyOf: (item: T) => string;
  render: (item: T) => React.ReactNode;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {items.map((item) => {
        const key = keyOf(item);
        const on = key === selected;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(key)}
            className={`rounded-2xl p-4 text-start ring-1 transition-colors duration-150 ${on ? "bg-brand/[0.06] ring-2 ring-brand/50" : "bg-surface ring-line hover:ring-brand/30"}`}
          >
            {render(item)}
          </button>
        );
      })}
    </div>
  );
}

// ---- Showing what was read ------------------------------------------------------

/** The original beside its English translation (stacked on phones); Arabic reads right to left. */
function TextCompare({
  original,
  english,
  language,
  copy,
  stacked = false,
}: {
  original: string | null;
  english: string | null;
  language: string | null;
  copy: PortalCopy;
  stacked?: boolean;
}) {
  const m = copy.modules;
  const name = language ? (m.languageNames[language] ?? language.toUpperCase()) : "";
  return (
    <div className={`grid grid-cols-1 gap-3 ${stacked ? "" : "lg:grid-cols-2"}`}>
      {original ? (
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-medium text-muted">{m.original(name)}</p>
          <div
            dir={language && RTL.has(language) ? "rtl" : "ltr"}
            lang={language ?? undefined}
            className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-4 text-sm leading-relaxed text-ink ring-1 ring-line"
          >
            {original}
          </div>
        </div>
      ) : null}
      {english ? (
        <div className="min-w-0">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Languages size={13} className="text-ai" aria-hidden /> {m.english}
          </p>
          <div lang="en" className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-violet-50/40 p-4 text-sm leading-relaxed text-ink ring-1 ring-violet-200">
            {english}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReadFields({ read, copy }: { read: Read; copy: PortalCopy }) {
  const m = copy.modules;
  const money = (n: number, ccy: string | null) => (ccy ? new Intl.NumberFormat(copy.locale, { style: "currency", currency: ccy }).format(n) : n.toLocaleString(copy.locale));
  const rows: [keyof typeof m.fields, string | null][] = [
    ["patientName", read.patientName],
    ["dateOfBirth", read.dateOfBirth],
    ["policyReference", read.policyReference],
    ["hospital", read.hospital],
    ["doctor", read.doctor],
    ["diagnosis", read.diagnosis],
    ["symptoms", read.symptoms.join("; ") || null],
    ["procedures", read.procedures.join("; ") || null],
    ["medications", read.medications.join("; ") || null],
    ["admissionDate", read.admissionDate],
    ["dischargeDate", read.dischargeDate],
    ["amount", read.amount != null ? money(read.amount, read.currency) : null],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{m.fields[k]}</dt>
            <dd className="min-w-0 break-words text-ink">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function DocLinks({ api, doc, copy }: { api: string; doc: DocView; copy: PortalCopy }) {
  const m = copy.modules;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      <a href={`${api}/documents/${doc.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
        <FileText size={15} aria-hidden /> {m.open}
      </a>
      {doc.english ? (
        <a href={`${api}/documents/${doc.id}/translation`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
          <FileDown size={15} aria-hidden /> {m.translationPdf}
        </a>
      ) : null}
    </div>
  );
}

function DocChips({ doc, copy }: { doc: DocView; copy: PortalCopy }) {
  const m = copy.modules;
  return (
    <span className="flex flex-wrap gap-1.5">
      <Chip>{m.kinds[doc.kind] ?? doc.kind}</Chip>
      {doc.language ? <Chip tone="info">{m.languageNames[doc.language] ?? doc.language.toUpperCase()}</Chip> : null}
      {doc.ocr ? <Chip tone="info">{m.ocr}</Chip> : null}
      {doc.status === "FAILED" ? <Chip tone="warn">{m.statuses.FAILED}</Chip> : null}
    </span>
  );
}

// ---- Inbox ------------------------------------------------------------------------

/** "Name <address>": the name in its own direction (Arabic reads right to left), the address under it. */
function Sender({ from }: { from: string }) {
  const m = from.match(/^(.*)<([^>]+)>\s*$/);
  if (!m) return <span dir="auto">{from}</span>;
  return (
    <>
      <span dir="auto" className="block">
        {m[1].trim()}
      </span>
      <span dir="ltr" className="block text-muted">
        {m[2].trim()}
      </span>
    </>
  );
}

function InboxModule({ api, samples, copy, lang }: { api: string; samples: InboxSampleCard[]; copy: PortalCopy; lang: PortalLang }) {
  const m = copy.modules;
  const [selected, setSelected] = useState(samples[0]?.id ?? "");
  const [runs, setRuns] = useState<Record<string, InboxRun>>({});
  const { busy, step, error, run } = useRun<InboxRun>(m.inboxSteps.length);
  useEffect(() => {
    void fetch(`${api}/inbox`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { runs?: InboxRun[] } | null) => b?.runs && setRuns(Object.fromEntries(b.runs.map((x) => [x.sample, x]))))
      .catch(() => undefined);
  }, [api]);

  const current = runs[selected];
  async function go() {
    const result = await run(`${api}/inbox`, { sample: selected }, (j) => j.run as InboxRun);
    if (result) setRuns((r) => ({ ...r, [result.sample]: result }));
  }

  return (
    <div className="space-y-5">
      <SampleChooser
        label={m.tabs.inbox}
        items={samples}
        selected={selected}
        onSelect={(k) => !busy && setSelected(k)}
        keyOf={(s) => s.id}
        render={(s) => {
          const Icon = CHANNEL_ICONS[s.channel] ?? Mail;
          return (
            <>
              <span className="flex flex-wrap items-center gap-1.5">
                <Chip>
                  <Icon size={12} aria-hidden /> {m.channels[s.channel]}
                </Chip>
                <Chip tone="info">{m.languageNames[s.language] ?? s.language}</Chip>
                {runs[s.id] ? (
                  <Chip tone="ok">
                    <CheckCircle2 size={12} aria-hidden /> {m.statuses[runs[s.id].status] ?? runs[s.id].status}
                  </Chip>
                ) : null}
              </span>
              <span className="mt-2 block text-[15px] font-semibold leading-snug text-ink">{s.title[lang]}</span>
              <span className="mt-0.5 block text-xs text-muted">{s.from}</span>
              <span className="mt-1.5 block text-sm leading-snug text-muted">{s.note[lang]}</span>
            </>
          );
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <RunButton busy={busy} done={Boolean(current)} labels={[m.receive, m.receiveAgain, m.receiving]} onClick={() => void go()} />
        <p className="text-sm text-muted">{copy.tryIt.noMinutes}</p>
      </div>
      <Trail steps={m.inboxSteps} step={step} busy={busy} />
      {error ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p> : null}
      {current && !busy ? <InboxResult api={api} run={current} copy={copy} /> : null}
    </div>
  );
}

function InboxResult({ api, run, copy }: { api: string; run: InboxRun; copy: PortalCopy }) {
  const m = copy.modules;
  const Icon = CHANNEL_ICONS[run.channel] ?? Mail;
  const translatedMessage = Boolean(run.english);
  return (
    <div className="animate-fade-up space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel icon={<Icon size={16} className="text-sky-600" aria-hidden />} title={`${m.message} · ${run.ref}`}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">{m.from}</dt>
            <dd className="min-w-0 break-words text-ink">
              <Sender from={run.from} />
            </dd>
            {run.subject ? (
              <>
                <dt className="text-muted">{m.subject}</dt>
                <dd dir="auto" className="min-w-0 break-words text-ink">
                  {run.subject}
                </dd>
              </>
            ) : null}
          </dl>
          {translatedMessage ? (
            <div className="mt-3">
              <TextCompare original={run.body} english={run.english} language={run.language} copy={copy} stacked />
            </div>
          ) : run.body ? (
            <p dir="auto" className="mt-3 whitespace-pre-line rounded-xl bg-canvas p-3 text-sm leading-relaxed text-ink">
              {run.body}
            </p>
          ) : null}
        </Panel>

        <div className="space-y-5">
          <Panel icon={<FolderCheck size={16} className="text-brand" aria-hidden />} title={m.aiSummary}>
            <p className="flex flex-wrap items-center gap-1.5">
              <Chip tone={run.status === "FAILED" ? "warn" : run.status === "NEEDS_REVIEW" ? "warn" : "ok"}>{m.statuses[run.status] ?? run.status}</Chip>
            </p>
            {run.summary ? <p className="mt-2 text-sm leading-relaxed text-ink">{run.summary}</p> : null}
            {run.matchedCase ? (
              <div className="mt-3 rounded-xl bg-emerald-50/60 p-3 ring-1 ring-emerald-200">
                <p className="text-xs font-medium text-emerald-800">{m.matched}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">
                  <span className="tabular-nums">{run.matchedCase.ref}</span> · {run.matchedCase.title}
                </p>
                {run.matchedCase.reasons.length ? (
                  <>
                    <p className="mt-2 text-xs font-medium text-muted">{m.why}</p>
                    <ul className="mt-1 space-y-0.5 text-sm text-ink">
                      {run.matchedCase.reasons.slice(0, 4).map((r) => (
                        <li key={r} className="flex gap-1.5">
                          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-amber-800">{m.noMatch}</p>
            )}
            {run.riskFlags.length ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted">{m.flags}</p>
                <ul className="mt-1 space-y-0.5 text-sm text-amber-800">
                  {run.riskFlags.map((f) => (
                    <li key={f} className="flex gap-1.5">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          {run.replies.length ? (
            <Panel icon={<Send size={16} className="text-brand" aria-hidden />} title={m.reply}>
              {run.replies.map((r, i) => (
                <div key={i} className="space-y-2">
                  <Chip tone={r.status === "QUEUED" ? "warn" : "ok"}>{r.status === "QUEUED" ? m.replyDraft : m.replyAuto}</Chip>
                  {r.subject ? <p className="text-sm font-medium text-ink">{r.subject}</p> : null}
                  <p dir="auto" className="whitespace-pre-line rounded-xl bg-canvas p-3 text-sm leading-relaxed text-ink">
                    {r.body}
                  </p>
                </div>
              ))}
            </Panel>
          ) : null}
        </div>
      </div>

      {run.documents.length ? (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-ink">{m.attachments}</h4>
          {run.documents.map((d) => (
            <Panel key={d.id} icon={<ScanText size={16} className="text-ai" aria-hidden />} title={d.filename}>
              <DocChips doc={d} copy={copy} />
              {d.read ? (
                <div className="mt-3">
                  <ReadFields read={d.read} copy={copy} />
                </div>
              ) : null}
              {d.english ? (
                <div className="mt-4">
                  <TextCompare original={d.original} english={d.english} language={d.language} copy={copy} />
                </div>
              ) : null}
              <div className="mt-3">
                <DocLinks api={api} doc={d} copy={copy} />
              </div>
            </Panel>
          ))}
        </div>
      ) : null}
      {run.documents.some((d) => d.english) || translatedMessage ? <p className="text-xs text-muted">{m.translationNote}</p> : null}
    </div>
  );
}

// ---- Document AI ------------------------------------------------------------------

function DocumentsModule({ api, samples, copy, lang }: { api: string; samples: DocumentSampleCard[]; copy: PortalCopy; lang: PortalLang }) {
  const m = copy.modules;
  const [selected, setSelected] = useState(samples[0]?.file ?? "");
  const [runs, setRuns] = useState<Record<string, DocView & { sample: string }>>({});
  const { busy, step, error, run } = useRun<DocView & { sample: string }>(m.docSteps.length);
  useEffect(() => {
    void fetch(`${api}/document-ai`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { runs?: (DocView & { sample: string })[] } | null) => b?.runs && setRuns(Object.fromEntries(b.runs.map((x) => [x.sample, x]))))
      .catch(() => undefined);
  }, [api]);

  const current = runs[selected];
  async function go() {
    const result = await run(`${api}/document-ai`, { file: selected }, (j) => j.run as DocView & { sample: string });
    if (result) setRuns((r) => ({ ...r, [result.sample]: result }));
  }

  return (
    <div className="space-y-5">
      <SampleChooser
        label={m.tabs.documents}
        items={samples}
        selected={selected}
        onSelect={(k) => !busy && setSelected(k)}
        keyOf={(s) => s.file}
        render={(s) => (
          <>
            <span className="flex flex-wrap items-center gap-1.5">
              <Chip tone="info">{m.languageNames[s.language] ?? s.language}</Chip>
              {runs[s.file] ? (
                <Chip tone="ok">
                  <CheckCircle2 size={12} aria-hidden /> {m.statuses.PROCESSED}
                </Chip>
              ) : null}
            </span>
            <span className="mt-2 block text-[15px] font-semibold leading-snug text-ink">{s.title[lang]}</span>
            <span className="mt-1 block text-sm leading-snug text-muted">{s.note[lang]}</span>
          </>
        )}
      />
      <div className="flex flex-wrap items-center gap-3">
        <RunButton busy={busy} done={Boolean(current)} labels={[m.read, m.readAgain, m.reading]} onClick={() => void go()} />
        <p className="text-sm text-muted">{copy.tryIt.noMinutes}</p>
      </div>
      <Trail steps={m.docSteps} step={step} busy={busy} />
      {error ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p> : null}
      {current && !busy ? (
        <div className="animate-fade-up space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <iframe key={current.id} title={current.filename} src={`${api}/documents/${current.id}#navpanes=0&view=FitH`} className="h-[min(72dvh,620px)] w-full" />
            </section>
            <Panel icon={<ScanText size={16} className="text-ai" aria-hidden />} title={m.readTitle}>
              <DocChips doc={current} copy={copy} />
              {current.error ? <p className="mt-3 text-sm text-amber-800">{current.error}</p> : null}
              {current.read ? (
                <>
                  <div className="mt-3">
                    <ReadFields read={current.read} copy={copy} />
                  </div>
                  {current.read.summary ? <p className="mt-3 rounded-xl bg-canvas p-3 text-sm leading-relaxed text-ink">{current.read.summary}</p> : null}
                  {current.read.missingInfo.length ? (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted">{m.missing}</p>
                      <ul className="mt-1 space-y-0.5 text-sm text-ink">
                        {current.read.missingInfo.map((x) => (
                          <li key={x} className="flex gap-1.5">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" aria-hidden /> {x}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {current.read.confidence != null ? (
                    <p className="mt-3 text-xs text-muted">
                      {m.confidence}: <span className="tabular-nums">{Math.round(current.read.confidence * 100)}%</span>
                    </p>
                  ) : null}
                </>
              ) : null}
              <div className="mt-4">
                <DocLinks api={api} doc={current} copy={copy} />
              </div>
            </Panel>
          </div>
          {current.english ? (
            <Panel icon={<Languages size={16} className="text-ai" aria-hidden />} title={m.english}>
              <TextCompare original={current.original} english={current.english} language={current.language} copy={copy} />
              <p className="mt-3 text-xs text-muted">{m.translationNote}</p>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---- Claims -----------------------------------------------------------------------

function ClaimsModule({ api, copy, lang }: { api: string; copy: PortalCopy; lang: PortalLang }) {
  const m = copy.modules;
  const c = m.claim;
  const [claim, setClaim] = useState<ClaimView | null>(null);
  const { busy, step, error, run } = useRun<ClaimView>(c.steps.length);
  useEffect(() => {
    void fetch(`${api}/claim`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { claim?: ClaimView | null } | null) => b?.claim && setClaim(b.claim))
      .catch(() => undefined);
  }, [api]);
  async function go() {
    const result = await run(`${api}/claim`, {}, (j) => j.claim as ClaimView);
    if (result) setClaim(result);
  }
  const s = claim?.settlement;
  const ccy = s?.currency ?? claim?.currency ?? "EUR";
  const money = (n: number) => new Intl.NumberFormat(copy.locale, { style: "currency", currency: ccy, maximumFractionDigits: 2 }).format(n);
  const claimStatus: Record<string, string> =
    lang === "tr"
      ? { NEEDS_REVIEW: "İnceleme bekliyor", APPROVED: "Onaylandı", INFO_REQUESTED: "Bilgi istendi", ESCALATED: "Üst seviyeye iletildi", PROCESSING: "İşleniyor" }
      : { NEEDS_REVIEW: "Waiting for review", APPROVED: "Approved", INFO_REQUESTED: "Information requested", ESCALATED: "Escalated", PROCESSING: "Processing" };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <RunButton busy={busy} done={Boolean(claim)} labels={[c.run, c.runAgain, c.running]} onClick={() => void go()} />
        <p className="text-sm text-muted">{copy.tryIt.noMinutes}</p>
      </div>
      <Trail steps={c.steps} step={step} busy={busy} />
      {error ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p> : null}
      {claim && !busy ? (
        <div className="animate-fade-up space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-lg font-semibold tabular-nums text-ink">{claim.ref}</span>
            <Chip tone="warn">{claimStatus[claim.status] ?? claim.status}</Chip>
            <span className="text-muted">
              {c.who}: <span className="text-ink">{claim.patient}</span>
              {claim.policy ? (
                <>
                  {" "}
                  · {c.policy}: <span className="tabular-nums text-ink">{claim.policy.number}</span> ({claim.policy.plan})
                </>
              ) : null}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-5">
              <Panel icon={<ScanText size={16} className="text-ai" aria-hidden />} title={c.documents}>
                <ul className="space-y-3">
                  {claim.documents.map((d) => (
                    <li key={d.id} className="rounded-xl bg-canvas p-3 ring-1 ring-line">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 break-words text-sm font-medium text-ink">{d.filename}</span>
                        <DocChips doc={d} copy={copy} />
                      </div>
                      {d.read ? (
                        <p className="mt-1.5 text-sm text-muted">
                          {[d.read.diagnosis, d.read.hospital, d.read.amount != null ? new Intl.NumberFormat(copy.locale, { style: "currency", currency: d.read.currency ?? ccy }).format(d.read.amount) : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                      <a href={`${api}/documents/${d.id}`} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
                        <FileText size={14} aria-hidden /> {m.open}
                      </a>
                    </li>
                  ))}
                </ul>
                {claim.summary ? <p className="mt-3 text-sm leading-relaxed text-ink">{claim.summary}</p> : null}
              </Panel>
              <Panel icon={<CheckCircle2 size={16} className="text-brand" aria-hidden />} title={c.checks}>
                <ul className="space-y-1 text-sm">
                  {[
                    ...(s?.checks ?? []).map((x) => ({ level: x.ok ? "ok" : "error", text: x.label })),
                    ...claim.issues.map((i) => ({ level: i.severity, text: i.message })),
                  ].map((x, i) => (
                    <li key={i} className="flex gap-1.5">
                      {x.level === "ok" ? (
                        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                      ) : x.level === "warning" ? (
                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
                      ) : (
                        <XCircle size={15} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
                      )}
                      <span className="text-ink">{x.text}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted">{c.ruleNote}</p>
              </Panel>
            </div>
            <div className="space-y-5">
              {s ? (
                <Panel icon={<Scale size={16} className="text-brand" aria-hidden />} title={c.settlement}>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
                    {(
                      [
                        [c.billed, s.billed, false],
                        [c.notCovered, -s.notCovered, false],
                        [c.aboveReference, -s.aboveReference, false],
                        [c.allowed, s.allowed, true],
                        [c.excess, -s.excess, false],
                        [c.overLimit, -s.overLimit, false],
                      ] as [string, number, boolean][]
                    )
                      .filter(([, v], i) => i === 0 || i === 3 || v !== 0)
                      .map(([label, v, strong]) => (
                        <div key={label} className="contents">
                          <dt className={strong ? "font-medium text-ink" : "text-muted"}>{label}</dt>
                          <dd className={`text-end tabular-nums ${strong ? "font-medium text-ink" : "text-ink"}`}>{money(v)}</dd>
                        </div>
                      ))}
                  </dl>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-brand/[0.07] p-3 ring-1 ring-brand/20">
                      <p className="text-xs font-medium text-muted">{c.payable}</p>
                      <p className="mt-0.5 text-xl font-bold tabular-nums text-brand">{money(s.payable)}</p>
                    </div>
                    <div className="rounded-xl bg-canvas p-3 ring-1 ring-line">
                      <p className="text-xs font-medium text-muted">{c.travellerPays}</p>
                      <p className="mt-0.5 text-xl font-bold tabular-nums text-ink">{money(s.travellerPays)}</p>
                    </div>
                  </div>
                  {s.reasons.length ? (
                    <>
                      <p className="mt-4 text-xs font-medium text-muted">{c.reasons}</p>
                      <ul className="mt-1 space-y-0.5 text-sm text-ink">
                        {s.reasons.map((r) => (
                          <li key={r}>· {r}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {s.attention.length ? (
                    <div className="mt-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                      <p className="text-xs font-medium text-amber-800">{c.attention}</p>
                      <ul className="mt-1 space-y-0.5 text-sm text-amber-900">
                        {s.attention.map((a) => (
                          <li key={a}>· {a}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p className="mt-3 text-xs text-muted">{c.approveNote}</p>
                </Panel>
              ) : null}
              {s?.lines.length ? (
                <Panel icon={<ReceiptText size={16} className="text-brand" aria-hidden />} title={c.lines}>
                  <div className="-mx-1 overflow-x-auto">
                    <table className="w-full min-w-[420px] text-sm">
                      <tbody>
                        {s.lines.map((l, i) => (
                          <tr key={i} className="border-t border-line first:border-0">
                            <td className="py-1.5 pe-3 align-top text-ink">
                              {l.description}
                              {l.remarks.length ? <span className="block text-xs text-amber-700">{l.remarks.join(" · ")}</span> : null}
                            </td>
                            <td className="py-1.5 pe-3 text-end align-top tabular-nums text-muted">{money(l.billed)}</td>
                            <td className={`py-1.5 text-end align-top tabular-nums ${l.allowed < l.billed ? "font-medium text-amber-700" : "text-ink"}`}>{money(l.allowed)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              ) : null}
              {claim.signals.length ? (
                <Panel icon={<ShieldAlert size={16} className="text-amber-600" aria-hidden />} title={c.signals}>
                  <ul className="space-y-1 text-sm text-ink">
                    {claim.signals.map((x) => (
                      <li key={x.code}>· {x.reason}</li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
