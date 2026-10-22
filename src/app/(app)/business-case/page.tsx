"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Clock, Coins, Copy, Euro, FileCheck2, FileText, Moon, ReceiptText, RotateCcw } from "lucide-react";
import { Button, Card, PageHeader, SectionTitle } from "@/components/ui";
import { QuotationWorkspace, draftToQuote, emptyQuoteDraft, type QuoteDraft } from "@/components/quotation/quotation-workspace";
import { CountUp } from "@/components/count-up";
import { BRAND, POWERED_BY } from "@/lib/brand";
import { formatMoney, formatMoneyExact } from "@/lib/format";
import {
  CURRENCY,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_COST_CONTAINMENT,
  DEFAULT_INPUTS,
  DEFAULT_RUNNING_COST_PRICES,
  DISCLAIMER,
  PRESETS,
  PRESET_MEDICAL_SPEND,
  businessCaseReport,
  costBasis,
  formatCount,
  formatDuration,
  formatRate,
  type Assumptions,
  type BusinessCaseInput,
  type CostContainmentInputs,
  type OperationInputs,
  type RunningCostPrices,
} from "@/lib/business-case";

// The presenter types the visitor's own numbers; every result recomputes on
// each keystroke. Fields hold the raw text (so a cleared field stays empty
// while typing) and are clamped to their range when the field is left.

interface FieldSpec<K extends string> {
  key: K;
  label: string;
  /** Shown beside the field. */
  unit?: string;
  /** The unit as words, for screen readers. */
  unitWords?: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
}

type Draft<T> = Record<keyof T, string>;

const OPERATION_GROUPS: { title: string; fields: FieldSpec<keyof OperationInputs>[] }[] = [
  {
    title: "Calls",
    fields: [
      { key: "monthlyCalls", label: "Inbound calls per month", min: 0, max: 1_000_000, step: 100 },
      { key: "afterHoursCallPct", label: "Share outside office hours", unit: "%", unitWords: "percent", min: 0, max: 100, step: 5 },
      { key: "callMinutes", label: "Average call handling time", unit: "min", unitWords: "minutes", min: 0, max: 120, step: 1 },
    ],
  },
  {
    title: "E-mail & fax",
    fields: [
      { key: "monthlyInbound", label: "E-mails & faxes per month", min: 0, max: 1_000_000, step: 100 },
      { key: "inboundMinutes", label: "Average handling time per message", unit: "min", unitWords: "minutes", min: 0, max: 120, step: 1 },
    ],
  },
  {
    title: "Claims",
    fields: [
      { key: "monthlyClaims", label: "Claims per month", min: 0, max: 1_000_000, step: 100 },
      { key: "claimReviewMinutes", label: "Average claim review time", unit: "min", unitWords: "minutes", min: 0, max: 480, step: 1 },
    ],
  },
  {
    title: "Letters of Guarantee",
    fields: [
      { key: "monthlyLetters", label: "Letters of Guarantee per month", min: 0, max: 100_000, step: 10 },
      { key: "letterHours", label: "Time to prepare and send one today", unit: "h", unitWords: "hours", min: 0, max: 72, step: 0.5 },
    ],
  },
  {
    title: "Team & cost",
    fields: [
      { key: "monthlyCases", label: "Assistance cases per month", min: 0, max: 1_000_000, step: 100 },
      { key: "costPerHour", label: "Loaded cost per agent hour", unit: "€", unitWords: "euros", min: 0, max: 500, step: 1 },
      { key: "productiveHoursPerMonth", label: "Productive hours per agent a month", unit: "h", unitWords: "hours", min: 40, max: 200, step: 5 },
    ],
  },
];

const percent = (key: keyof Assumptions, label: string, hint: string): FieldSpec<keyof Assumptions> => ({
  key,
  label,
  hint,
  unit: "%",
  unitWords: "percent",
  min: 0,
  max: 100,
  step: 5,
});

const COST_FIELDS: FieldSpec<keyof CostContainmentInputs>[] = [
  { key: "annualMedicalSpend", label: "Medical spend abroad a year", unit: "€", unitWords: "euros", min: 0, max: 10_000_000_000, step: 100_000 },
  { key: "reviewedPct", label: "Bills reviewed line by line", unit: "%", unitWords: "percent", min: 0, max: 100, step: 5 },
  { key: "savingPct", label: "Average saving on a reviewed bill", unit: "%", unitWords: "percent", min: 0, max: 60, step: 1 },
];

const euroRate = (key: keyof RunningCostPrices, label: string, max = 10): FieldSpec<keyof RunningCostPrices> => ({
  key,
  label,
  unit: "€",
  unitWords: "euros",
  min: 0,
  max,
  step: 0.001,
});

const PRICE_GROUPS: { title: string; fields: FieldSpec<keyof RunningCostPrices>[] }[] = [
  {
    title: "Voice",
    fields: [
      euroRate("voicePerMinute", "Voice AI, per minute"),
      euroRate("phonePerMinute", "Phone line, per minute"),
      { key: "handoverMinutes", label: "AI time on a call it hands over", unit: "min", unitWords: "minutes", min: 0, max: 60, step: 0.5 },
    ],
  },
  {
    title: "Document AI, per item",
    fields: [
      euroRate("perCallNote", "Call note"),
      euroRate("perMessage", "E-mail or fax"),
      euroRate("perClaim", "Claim"),
      euroRate("perLetter", "Letter of Guarantee"),
    ],
  },
  {
    title: "Cloud",
    fields: [{ key: "cloudPerMonth", label: "Cloud hosting a month", unit: "€", unitWords: "euros", min: 0, max: 1_000_000, step: 10 }],
  },
];

const ASSUMPTION_FIELDS = [
  percent(
    "aiHandledCallPct",
    "Calls the AI handles end-to-end",
    "Routine calls — coverage questions, case updates, bookings — answered and closed without a person."
  ),
  percent(
    "assistedCallTimeSavedPct",
    "Time saved on calls a person still takes",
    "The AI triages the caller and writes the summary, so the agent starts informed and skips the notes."
  ),
  percent(
    "claimTimeSavedPct",
    "Claim review time saved",
    "Documents read and checked for completeness before a handler opens the claim; the decision stays human."
  ),
  percent(
    "letterTimeSavedPct",
    "Letter of Guarantee preparation time saved",
    "Cost estimate read, coverage checked and the letter drafted, ready for approval and sending."
  ),
  percent(
    "inboundAutomatedPct",
    "E-mails & faxes handled automatically",
    "Read (with OCR for faxes), matched to the case and answered or filed without a person."
  ),
];

function toDraft<T extends object>(values: T): Draft<T> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])) as Draft<T>;
}

/** Blank or half-typed fields count as zero; the calculation clamps the rest. */
function fromDraft<T>(draft: Draft<T>): Record<keyof T, number> {
  return Object.fromEntries(
    Object.entries(draft).map(([k, v]) => [k, Number(v)])
  ) as Record<keyof T, number>;
}

/** The value a field settles on when it is left: a number within its range. */
function settle(raw: string, spec: FieldSpec<string>): string {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) return String(spec.min);
  return String(Math.min(spec.max, Math.max(spec.min, n)));
}

/** Fallback where the async clipboard is missing (plain http, older browsers). */
function copyWithSelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

function NumberField<K extends string>({
  spec,
  value,
  onChange,
  onBlur,
  inline = false,
}: {
  spec: FieldSpec<K>;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** Label and hint beside the field (assumptions) instead of above it. */
  inline?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const label = (
    <label htmlFor={id} className="text-sm font-medium text-slate-700">
      {spec.label}
      {spec.unitWords ? <span className="sr-only"> ({spec.unitWords})</span> : null}
    </label>
  );
  const input = (
    <div className="flex rounded-lg transition-shadow focus-within:ring-2 focus-within:ring-blue-100">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-describedby={spec.hint ? hintId : undefined}
        className={`w-full min-w-0 border border-slate-300 bg-white px-3 py-2 text-base font-medium tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none ${
          spec.unit ? "rounded-l-lg" : "rounded-lg"
        }`}
      />
      {spec.unit ? (
        <span
          aria-hidden
          className="flex shrink-0 items-center rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500"
        >
          {spec.unit}
        </span>
      ) : null}
    </div>
  );
  const hint = spec.hint ? (
    <p id={hintId} className="mt-0.5 text-sm leading-snug text-slate-500">
      {spec.hint}
    </p>
  ) : null;

  if (inline) {
    return (
      <div className="grid items-center gap-x-5 gap-y-2 sm:grid-cols-[1fr_8.5rem]">
        <div>
          {label}
          {hint}
        </div>
        {input}
      </div>
    );
  }
  return (
    <div className="flex flex-col justify-end gap-1.5">
      {label}
      {input}
      {hint}
    </div>
  );
}

export default function BusinessCasePage() {
  const [operation, setOperation] = useState(() => toDraft(DEFAULT_INPUTS));
  const [assumptionDraft, setAssumptionDraft] = useState(() => toDraft(DEFAULT_ASSUMPTIONS));
  const [costDraft, setCostDraft] = useState(() => toDraft(DEFAULT_COST_CONTAINMENT));
  const [priceDraft, setPriceDraft] = useState(() => toDraft(DEFAULT_RUNNING_COST_PRICES));
  const [pricesOpen, setPricesOpen] = useState(false);
  const pricesPanel = useId();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  // What the quotation adds (customer, service charges) lives here, so closing
  // the quotation to change a number keeps everything typed into it.
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraft>(emptyQuoteDraft);
  const [quoteOpen, setQuoteOpen] = useState(false);
  // Set when the quotation is for a lead that exists already (a visitor from the QR page).
  const [quoteLeadId, setQuoteLeadId] = useState<string | null>(null);
  const closeQuote = useCallback(() => setQuoteOpen(false), []);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // "Generate quotation" from the Leads page lands here with the quotation
  // open; from a visitor lead, with their details already filled in.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("quote") !== "new") return;
    setQuoteOpen(true);
    window.history.replaceState(null, "", window.location.pathname);
    setQuoteLeadId(params.get("lead"));
  }, []);

  // A visitor lead's contact details fill the quotation in; the quotation then files onto that lead.
  useEffect(() => {
    if (!quoteLeadId) return;
    let live = true;
    fetch(`/api/leads/${encodeURIComponent(quoteLeadId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { lead?: { customerName: string; companyName: string; email: string | null; phone: string | null } } | null) => {
        if (!live || !body?.lead) return;
        const { lead } = body;
        setQuoteDraft((d) => ({ ...d, customerName: lead.customerName, companyName: lead.companyName, email: lead.email ?? "", phone: lead.phone ?? "" }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [quoteLeadId]);

  const inputs = useMemo(() => fromDraft<OperationInputs>(operation), [operation]);
  const assumptions = useMemo(() => fromDraft<Assumptions>(assumptionDraft), [assumptionDraft]);
  const costInputs = useMemo(() => fromDraft<CostContainmentInputs>(costDraft), [costDraft]);
  const prices = useMemo(() => fromDraft<RunningCostPrices>(priceDraft), [priceDraft]);
  const base = useMemo(
    () => ({ operation: inputs, assumptions, prices, costContainment: costInputs }),
    [inputs, assumptions, prices, costInputs]
  );
  // The page shows the whole platform; the quotation applies its own scope (the services it leaves out) on top.
  const input: BusinessCaseInput = useMemo(() => ({ ...base, quote: { ...draftToQuote(quoteDraft), excluded: [] } }), [base, quoteDraft]);
  const report = useMemo(() => businessCaseReport(input), [input]);
  const { result, running, cost, summary } = report;

  const activePreset = PRESETS.find((p) =>
    (Object.keys(p.inputs) as (keyof OperationInputs)[]).every((k) => inputs[k] === p.inputs[k])
  )?.id;
  const assumptionsAreDefault = (Object.keys(DEFAULT_ASSUMPTIONS) as (keyof Assumptions)[]).every(
    (k) => assumptions[k] === DEFAULT_ASSUMPTIONS[k]
  );
  const pricesAreDefault = (Object.keys(DEFAULT_RUNNING_COST_PRICES) as (keyof RunningCostPrices)[]).every(
    (k) => prices[k] === DEFAULT_RUNNING_COST_PRICES[k]
  );

  async function copySummary() {
    let ok: boolean;
    try {
      await navigator.clipboard.writeText(summary);
      ok = true;
    } catch {
      ok = copyWithSelection(summary);
    }
    clearTimeout(copiedTimer.current);
    setCopyState(ok ? "copied" : "failed");
    if (ok) copiedTimer.current = setTimeout(() => setCopyState("idle"), 2500);
  }

  const eur = (amount: number) => formatMoney(Math.round(amount), CURRENCY);
  // Tile values stay short enough for four across, even in presentation mode
  // ("€2.81M"). Formatted by hand: Intl's compact notation differs between
  // Node and browsers, which breaks hydration.
  const eurShort = (amount: number) => {
    if (amount < 1_000_000) return eur(amount);
    const m = amount / 1_000_000;
    return `€${m.toFixed(m >= 100 ? 0 : m >= 10 ? 1 : 2).replace(/\.0+$|(\.\d*?)0+$/, "$1")}M`;
  };
  const tiles = [
    {
      icon: Clock,
      accent: "bg-blue-50 text-blue-600",
      value: result.hoursFreed,
      format: (n: number) => formatCount(n),
      label: "Agent hours freed a month",
      context: `the work of ${formatCount(result.fte, 1)} full-time staff`,
    },
    {
      icon: Euro,
      accent: "bg-emerald-50 text-emerald-600",
      value: running.netAnnualSaving,
      format: eurShort,
      label: "Net saving a year",
      context: `${eur(result.annualSaving)} of agent time, less ${eur(running.annualCost)} running cost`,
    },
    {
      icon: Moon,
      accent: "bg-indigo-50 text-indigo-600",
      value: result.afterHoursCalls,
      format: (n: number) => formatCount(n),
      label: "After-hours calls answered instantly",
      context: "a month — no queue, no voicemail",
    },
    {
      icon: FileCheck2,
      accent: "bg-violet-50 text-violet-600",
      value: result.letterMinutesAutomated,
      format: formatDuration,
      label: "Letter of Guarantee turnaround",
      context: `instead of ${formatDuration(result.letterMinutesToday)} today`,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Business Case"
        subtitle={`What ${BRAND.name} would free up in your operation. Enter your own numbers — every result updates as you type.`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" aria-live="polite" className="sr-only">
            {copyState === "copied" ? "Summary copied to the clipboard" : ""}
          </span>
          <Button onClick={() => setQuoteOpen(true)}>
            <FileText size={15} aria-hidden />
            Generate quotation
          </Button>
          <Button variant={copyState === "copied" ? "success" : "secondary"} onClick={() => void copySummary()}>
            {copyState === "copied" ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copyState === "copied" ? "Copied" : "Copy summary"}
          </Button>
        </div>
      </PageHeader>

      {quoteOpen ? (
        <QuotationWorkspace
          base={base}
          draft={quoteDraft}
          onDraftChange={setQuoteDraft}
          onPricesChange={(p) => setPriceDraft(toDraft(p))}
          onClose={closeQuote}
          leadId={quoteLeadId}
        />
      ) : null}

      {copyState === "failed" ? (
        <Card className="mb-5 border-amber-200 bg-amber-50">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p role="alert" className="text-sm text-amber-800">
              This browser didn&apos;t allow copying. Select the summary below and copy it by hand.
            </p>
            <Button variant="secondary" onClick={() => setCopyState("idle")}>
              Close
            </Button>
          </div>
          <textarea
            readOnly
            value={summary}
            rows={12}
            aria-label="Business case summary"
            onFocus={(e) => e.currentTarget.select()}
            className="mt-3 w-full rounded-lg border border-amber-200 bg-white p-3 font-mono text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </Card>
      ) : null}

      {/* The answer first, readable from across the stand. */}
      <div className="animate-fade-up rounded-2xl bg-brand bg-brand-gradient p-6 text-white shadow-glow md:p-7">
        <p className="text-sm font-medium text-white/80">Your business case</p>
        <p aria-live="polite" className="mt-1.5 max-w-4xl text-xl font-semibold leading-snug md:text-2xl">
          {report.headline}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ icon: Icon, accent, value, format, label, context }) => (
          <Card key={label} className="py-4">
            <div className={`mb-2.5 inline-flex rounded-lg p-2 ${accent}`}>
              <Icon size={18} aria-hidden />
            </div>
            <p className="text-3xl font-semibold tracking-tight tabular-nums text-ink 2xl:text-4xl">
              <CountUp value={value} format={format} durationMs={500} />
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
            <p className="mt-0.5 text-sm leading-snug text-slate-500">{context}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <SectionTitle>What the AI costs to run</SectionTitle>
        <p className="mt-1 text-sm text-muted">
          Pay-as-you-go prices for the voice AI, its phone line and the document AI at your volumes, plus the cloud it runs on. The net saving above already takes it off.
        </p>
        <div className="mt-3 grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <table className="w-full text-sm">
              <caption className="sr-only">AI running cost per month, by item</caption>
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">Item</th>
                  <th scope="col" className="py-2 text-right font-medium">A month</th>
                </tr>
              </thead>
              <tbody>
                {running.lines.map((l) => (
                  <tr key={l.item} className="border-b border-line/70">
                    <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                      <span className="block font-medium text-ink">{l.label}</span>
                      <span className="block tabular-nums text-muted">
                        {costBasis(l)}
                        {l.item === "voice" && running.callsHandedOver > 0
                          ? ` · ${formatCount(running.callsClosed)} calls closed by the AI, ${formatCount(running.callsHandedOver)} handed to a person after ${formatCount(running.handoverMinutes, Number.isInteger(running.handoverMinutes) ? 0 : 1)} min`
                          : ""}
                      </span>
                    </th>
                    <td className="py-2.5 text-right tabular-nums text-ink">{eur(l.cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-base font-semibold text-ink">
                  <th scope="row" className="pb-1 pr-3 pt-3 text-left">
                    Total a month
                  </th>
                  <td className="pb-1 pt-3 text-right tabular-nums">{eur(running.monthlyCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-col justify-center gap-6 rounded-xl bg-canvas p-5 lg:col-span-2">
            <div>
              <Coins size={20} aria-hidden className="text-brand" />
              <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-ink 2xl:text-4xl">
                <CountUp value={running.annualCost} format={eurShort} durationMs={500} />
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">AI running cost a year</p>
              <p className="mt-0.5 text-sm text-muted">
                {eur(running.monthlyCost)} a month
                {running.costPerCase > 0 ? ` · ${formatMoneyExact(running.costPerCase, CURRENCY)} per case` : ""}
              </p>
            </div>

            {/* What the AI frees against what it costs, on one scale. */}
            <dl className="space-y-3 text-sm">
              {[
                { label: "Agent time freed", value: result.monthlySaving, bar: "bg-brand" },
                { label: "AI running cost", value: running.monthlyCost, bar: "bg-muted/60" },
              ].map(({ label, value, bar }) => (
                <div key={label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted">{label}, a month</dt>
                    <dd className="font-semibold tabular-nums text-ink">{eur(value)}</dd>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line/70" aria-hidden>
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ease-smooth ${bar}`}
                      style={{ width: `${(value / Math.max(result.monthlySaving, running.monthlyCost, 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </dl>

            <div className="border-t border-line pt-4">
              {running.returnPerEuro > 0 ? (
                <p className="text-sm text-ink">
                  <span className="text-2xl font-semibold tabular-nums text-brand">{eur(running.returnPerEuro)}</span> of agent time freed for every €1 the AI costs
                </p>
              ) : null}
              {running.agentMinuteCost > 0 ? (
                <p className="mt-1 text-sm text-muted">
                  A minute on the phone: {formatRate(running.aiMinuteCost)} with the voice AI, {formatRate(running.agentMinuteCost)} with an agent.
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <button
            type="button"
            aria-expanded={pricesOpen}
            aria-controls={pricesPanel}
            onClick={() => setPricesOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-deep"
          >
            Edit the prices
            <ChevronDown size={15} aria-hidden className={`transition-transform duration-150 ${pricesOpen ? "rotate-180" : ""}`} />
          </button>
          {pricesOpen ? (
            <div id={pricesPanel} className="mt-3 animate-fade-up space-y-4 rounded-lg border border-line bg-canvas p-4">
              {PRICE_GROUPS.map((group) => (
                <fieldset key={group.title}>
                  <legend className="text-sm font-semibold text-ink">{group.title}</legend>
                  <div className={`mt-1 grid items-end gap-3 ${group.fields.length > 3 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
                    {group.fields.map((spec) => (
                      <NumberField
                        key={spec.key}
                        spec={spec}
                        value={priceDraft[spec.key]}
                        onChange={(v) => setPriceDraft((d) => ({ ...d, [spec.key]: v }))}
                        onBlur={() => setPriceDraft((d) => ({ ...d, [spec.key]: settle(d[spec.key], spec) }))}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="max-w-prose text-sm text-muted">
                  List prices of the voice AI, the phone carrier and the language model behind this demo (October 2026, $1 = €0.92). Document AI is priced from the text each step reads and writes. The platform licence is not included.
                </p>
                <Button
                  variant="secondary"
                  disabled={pricesAreDefault}
                  onClick={() => setPriceDraft(toDraft(DEFAULT_RUNNING_COST_PRICES))}
                  className="px-3 py-1.5"
                >
                  <RotateCcw size={14} aria-hidden />
                  Restore list prices
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="mt-5">
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <SectionTitle>Medical spend: what bill review saves</SectionTitle>
            <p className="mt-1 text-sm text-muted">
              Separate from the hours above. Hospital bills are checked line by line against your tariff before they are paid; a person accepts every change.
            </p>
            <div className="mt-4 grid items-end gap-3 sm:grid-cols-3">
              {COST_FIELDS.map((spec) => (
                <NumberField
                  key={spec.key}
                  spec={spec}
                  value={costDraft[spec.key]}
                  onChange={(v) => setCostDraft((d) => ({ ...d, [spec.key]: v }))}
                  onBlur={() => setCostDraft((d) => ({ ...d, [spec.key]: settle(d[spec.key], spec) }))}
                />
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">
              Overcharges, extra nights, duplicates and comfort items come off. The saving rate starts low on purpose; on overbilled tourist-area invoices it is often far higher.
            </p>
          </div>
          <div className="flex flex-col justify-center rounded-xl bg-canvas p-5 lg:col-span-2">
            <ReceiptText size={20} aria-hidden className="text-brand" />
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-ink 2xl:text-4xl">
              <CountUp value={cost.annualSaving} format={eurShort} durationMs={500} />
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">Medical spend saved a year</p>
            <p className="mt-0.5 text-sm text-muted">
              {eur(cost.monthlySaving)} a month, on {eurShort(cost.reviewedSpend)} of reviewed bills.
              {result.annualSaving > 0 ? ` With the operating savings, after AI costs: ${eurShort(cost.annualSaving + running.netAnnualSaving)} a year.` : ""}
            </p>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card>
            <SectionTitle>Your operation — per month, in EUR</SectionTitle>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-500">Start from:</span>
              {PRESETS.map((p) => (
                <Button
                  key={p.id}
                  variant={activePreset === p.id ? "primary" : "secondary"}
                  aria-pressed={activePreset === p.id}
                  onClick={() => {
                    setOperation(toDraft(p.inputs));
                    setCostDraft((d) => ({ ...d, annualMedicalSpend: String(PRESET_MEDICAL_SPEND[p.id] ?? d.annualMedicalSpend) }));
                  }}
                  className="px-3 py-1.5"
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <div className="mt-5 space-y-5">
              {OPERATION_GROUPS.map((group) => (
                <fieldset key={group.title} className="border-t border-slate-100 pt-4">
                  <legend className="pr-2 text-sm font-semibold text-slate-900">{group.title}</legend>
                  <div className="mt-1 grid items-end gap-3 sm:grid-cols-3">
                    {group.fields.map((spec) => (
                      <NumberField
                        key={spec.key}
                        spec={spec}
                        value={operation[spec.key]}
                        onChange={(v) => setOperation((d) => ({ ...d, [spec.key]: v }))}
                        onBlur={() =>
                          setOperation((d) => ({ ...d, [spec.key]: settle(d[spec.key], spec) }))
                        }
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <SectionTitle>Assumptions — edit to match your operation</SectionTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Conservative starting points, not promises. Change any of them and the results follow.
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={assumptionsAreDefault}
                onClick={() => setAssumptionDraft(toDraft(DEFAULT_ASSUMPTIONS))}
                className="px-3 py-1.5"
              >
                <RotateCcw size={14} aria-hidden />
                Restore defaults
              </Button>
            </div>
            <div className="mt-5 space-y-4">
              {ASSUMPTION_FIELDS.map((spec) => (
                <NumberField
                  key={spec.key}
                  inline
                  spec={spec}
                  value={assumptionDraft[spec.key]}
                  onChange={(v) => setAssumptionDraft((d) => ({ ...d, [spec.key]: v }))}
                  onBlur={() =>
                    setAssumptionDraft((d) => ({ ...d, [spec.key]: settle(d[spec.key], spec) }))
                  }
                />
              ))}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <div className="space-y-3 lg:sticky lg:top-20">
            <Card>
              <SectionTitle>Where the time comes from</SectionTitle>
              <table className="mt-3 w-full text-sm">
                <caption className="sr-only">Agent hours and cost freed per month, by area</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th scope="col" className="py-2 pr-3 font-medium">Area</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Hours freed</th>
                    <th scope="col" className="py-2 text-right font-medium">Saving</th>
                  </tr>
                </thead>
                <tbody>
                  {result.areas.map((a) => (
                    <tr key={a.area} className="border-b border-slate-100">
                      <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                        <span className="block font-medium text-slate-800">{a.label}</span>
                        <span className="block text-slate-500">
                          {formatCount(a.volume)} a month · {formatCount(a.hoursToday)} h today
                        </span>
                      </th>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-800">
                        {formatCount(a.hoursFreed)} h
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-800">{eur(a.saving)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-base font-semibold text-slate-900">
                    <th scope="row" className="pb-1 pr-3 pt-3 text-left">Total a month</th>
                    <td className="pb-1 pr-3 pt-3 text-right tabular-nums">{formatCount(result.hoursFreed)} h</td>
                    <td className="pb-1 pt-3 text-right tabular-nums">{eur(result.monthlySaving)}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="mt-2 text-sm text-slate-500">
                {formatCount(result.shareFreed * 100)}% of today&apos;s {formatCount(result.hoursToday)} handling
                hours · {eur(result.annualSaving)} a year
              </p>
            </Card>
            <p className="px-1 text-sm text-slate-500">
              {DISCLAIMER}. {BRAND.name} · {POWERED_BY}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
