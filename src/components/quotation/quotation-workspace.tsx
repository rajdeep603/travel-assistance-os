"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCircle2, Download, Mail, Plus, Printer, Send, X } from "lucide-react";
import { Button, ErrorBanner, readApiError } from "@/components/ui";
import { ProposeCall, type ContactConsent } from "@/components/leads/propose-call";
import { QuotationPreview } from "@/components/quotation/quotation-preview";
import {
  COST_ITEMS,
  CURRENCY,
  DEFAULT_RUNNING_COST_PRICES,
  LINE_PRICE,
  businessCaseReport,
  calculateRunningCost,
  excludedServices,
  formatCount,
  longDate,
  quoteMeta,
  type BusinessCaseInput,
  type CostItem,
  type CostLine,
  type QuoteDetails,
  type RunningCostPrices,
} from "@/lib/business-case";
import { formatMoney } from "@/lib/format";
import { PILOT_DAYS, PILOTS, pilotPlan } from "@/lib/pilots";
import { describeCallSlot, type Mentioned } from "@/lib/calls";
import { printElement } from "@/lib/client/print";
import { zonedToday } from "@/lib/time";

// ---------------------------------------------------------------------------
// Generate quotation: the customer's details, the monthly services (each one
// can be left out or re-priced) and Sthiram's service charges on the left,
// the quotation exactly as it will print on the right. From here it prints,
// downloads, is submitted as a lead, or goes to the customer in one e-mail:
// the quotation, a Teams call invite, or both (an invite submits it first).
// ---------------------------------------------------------------------------

/** A service charge as typed: the amount stays text until it is sent. */
export interface ServiceDraft {
  id: number;
  description: string;
  amount: string;
}

export interface QuoteDraft {
  customerName: string;
  companyName: string;
  email: string;
  phone: string;
  services: ServiceDraft[];
  /** A pilot id from src/lib/pilots.ts, or "" for none. */
  pilot: string;
  /** Monthly services unticked, as ticked off (dependents are worked out by the calculation). */
  excluded: CostItem[];
  /** Bill review paid from its savings, % as typed; "" when not offered. */
  gainshare: string;
}

const MAX_SERVICES = 20;
/** Hints for the starting rows: the kind of charge a quotation carries, never a price. */
const SERVICE_HINTS = ["e.g. Setup and configuration", "e.g. Integration with your claims system", "e.g. Team training"];

let nextId = SERVICE_HINTS.length + 1;
const blankService = (): ServiceDraft => ({ id: nextId++, description: "", amount: "" });

export function emptyQuoteDraft(): QuoteDraft {
  return {
    customerName: "",
    companyName: "",
    email: "",
    phone: "",
    services: SERVICE_HINTS.map((_, i) => ({ id: i + 1, description: "", amount: "" })),
    pilot: "",
    excluded: [],
    gainshare: "",
  };
}

export function draftToQuote(draft: QuoteDraft): QuoteDetails {
  return {
    customerName: draft.customerName,
    companyName: draft.companyName,
    email: draft.email,
    phone: draft.phone,
    services: draft.services.map((s) => ({ description: s.description, amount: Number(s.amount) })),
    pilot: draft.pilot || undefined,
    // Left out of the JSON when nothing is excluded, so earlier quotations keep their numbers.
    ...(draft.excluded.length ? { excluded: draft.excluded } : {}),
    ...(Number(draft.gainshare) > 0 ? { gainsharePct: Math.min(100, Number(draft.gainshare)) } : {}),
  };
}

/** The prices as typed in the dialog: text while editing, numbers once sent up. */
type RateText = Record<keyof RunningCostPrices, string>;
const rateText = (prices: RunningCostPrices): RateText =>
  Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, String(v)])) as RateText;

/** "25,200 min a month at", "4,000 a month at", before the price field. */
function basisLead(line: CostLine): string {
  if (line.unit === "month") return "Servers, database, storage and backups at";
  return `${formatCount(line.volume)}${line.unit === "min" ? " min" : ""} a month at`;
}
const UNIT_WORDS: Record<CostLine["unit"], string> = { min: "a minute", item: "each", month: "a month" };

const FIELD =
  "mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-base text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";
const LINK_BUTTON = "inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-deep";

type Note = { tone: "ok" | "error"; text: string; lead?: { id: string; ref: string } };

export function QuotationWorkspace({
  base,
  draft,
  onDraftChange,
  onPricesChange,
  onClose,
  leadId = null,
  leadContext = null,
}: {
  base: Omit<BusinessCaseInput, "quote">;
  draft: QuoteDraft;
  onDraftChange: (draft: QuoteDraft) => void;
  /** A price changed on a service line: the business case takes it too, so the two never disagree. */
  onPricesChange: (prices: RunningCostPrices) => void;
  onClose: () => void;
  /** An existing lead (a visitor from the QR page) the quotation is filed on, instead of opening a new one. */
  leadId?: string | null;
  /** That lead's own words and consent, for a personal e-mail sent without asking twice. */
  leadContext?: { mentioned: Mentioned; consent: ContactConsent | null } | null;
}) {
  const [today] = useState(() => zonedToday());
  const input: BusinessCaseInput = useMemo(() => ({ ...base, quote: draftToQuote(draft) }), [base, draft]);
  const report = useMemo(() => businessCaseReport(input), [input]);
  const meta = useMemo(() => quoteMeta(input, today), [input, today]);
  // Every service line, whether in the quotation or not, so an unticked one can be ticked back.
  const allLines = useMemo(() => calculateRunningCost(base.operation, base.assumptions, base.prices).lines, [base]);
  const excluded = useMemo(() => new Set(excludedServices(draft.excluded)), [draft.excluded]);

  const [rates, setRates] = useState<RateText>(() => rateText(base.prices));
  const [busy, setBusy] = useState<"pdf" | "print" | "submit" | null>(null);
  /** The mailbox Teams invites come from, when this server can send them. */
  const [callOrganizer, setCallOrganizer] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [submitted, setSubmitted] = useState<{ number: string; id: string; ref: string } | null>(null);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const servicesId = useId();
  const ids = { customer: useId(), company: useId(), email: useId(), phone: useId() };

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Open as a page of its own: keyboard to the first field, Escape closes, the
  // page behind stays still, and focus goes back where it was on the way out.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    customerRef.current?.focus();
    // A panel open on top (Propose a call) takes its own Escape.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && closeRef.current();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    fetch("/api/business-case/email")
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((body: { configured?: boolean }) => setEmailConfigured(Boolean(body.configured)))
      .catch(() => setEmailConfigured(false));
    fetch("/api/meetings")
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((body: { configured?: boolean; organizer?: string | null }) => setCallOrganizer(body.configured ? (body.organizer ?? null) : null))
      .catch(() => setCallOrganizer(null));
  }, []);

  const set = (change: Partial<QuoteDraft>) => onDraftChange({ ...draft, ...change });
  const setService = (id: number, change: Partial<ServiceDraft>) =>
    set({ services: draft.services.map((s) => (s.id === id ? { ...s, ...change } : s)) });
  const removeService = (id: number) =>
    set({ services: draft.services.length > 1 ? draft.services.filter((s) => s.id !== id) : [blankService()] });
  /** Choosing a pilot fills in its usual service charges, unless some are typed already; amounts stay the presenter's. */
  const choosePilot = (id: string) => {
    const plan = pilotPlan(id);
    const untouched = draft.services.every((s) => !s.description.trim() && !s.amount.trim());
    set({ pilot: id, ...(plan && untouched ? { services: plan.services.map((description) => ({ ...blankService(), description })) } : {}) });
  };
  /** Ticks a monthly service in or out; the list keeps the quotation's order so the same scope always numbers the same. */
  const includeService = (item: CostItem, include: boolean) => {
    const next = new Set(draft.excluded);
    if (include) next.delete(item);
    else next.add(item);
    set({ excluded: COST_ITEMS.filter((i) => next.has(i)) });
  };
  const setRate = (key: keyof RunningCostPrices, text: string) => {
    setRates((r) => ({ ...r, [key]: text }));
    const n = Number(text);
    onPricesChange({ ...base.prices, [key]: text.trim() !== "" && Number.isFinite(n) && n > 0 ? n : 0 });
  };
  /** A blank or broken price settles on zero when the field is left, as the page's fields do. */
  const settleRate = (key: keyof RunningCostPrices) => {
    const n = Number(rates[key]);
    if (rates[key].trim() === "" || !Number.isFinite(n) || n < 0) setRate(key, "0");
  };
  const pricesAreDefault = (Object.keys(DEFAULT_RUNNING_COST_PRICES) as (keyof RunningCostPrices)[]).every(
    (k) => base.prices[k] === DEFAULT_RUNNING_COST_PRICES[k]
  );
  const restorePrices = () => {
    setRates(rateText(DEFAULT_RUNNING_COST_PRICES));
    onPricesChange(DEFAULT_RUNNING_COST_PRICES);
  };

  const submittedNow = submitted?.number === meta.number;
  const missing = { customer: !draft.customerName.trim(), company: !draft.companyName.trim() };
  const eur = (n: number) => formatMoney(Math.round(n), CURRENCY);

  async function download() {
    setBusy("pdf");
    setNote(null);
    try {
      const res = await fetch("/api/business-case/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      if (!res.ok) throw new Error(await readApiError(res, "The quotation couldn't be made. Please try again."));
      const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "quotation.pdf";
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setNote({ tone: "error", text: err instanceof Error ? err.message : "The quotation couldn't be made. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function print() {
    const page = previewRef.current?.firstElementChild;
    if (!(page instanceof HTMLElement)) return;
    setBusy("print");
    try {
      await printElement(page, `Quotation ${meta.number}`);
    } catch (err) {
      setNote({ tone: "error", text: err instanceof Error ? err.message : "Printing didn't start. Download the PDF and print that instead." });
    } finally {
      setBusy(null);
    }
  }

  /** The quotation alone, by e-mail (the send panel's "quotation only"): one e-mail to each address. */
  async function emailQuotation(p: { to: string[]; subject: string; message: string }): Promise<string[]> {
    const res = await fetch("/api/business-case/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...p, input }),
    });
    if (!res.ok) throw new Error(await readApiError(res, "The e-mail couldn't be sent. Please try again."));
    return ((await res.json()) as { to: string[] }).to;
  }

  /** Files the quotation as a lead (or finds it filed already): submitting does, and so does proposing a call. */
  async function fileLead(): Promise<{ lead: { id: string; ref: string }; existing: boolean }> {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input, ...(leadId ? { leadId } : {}) }),
    });
    if (!res.ok) throw new Error(await readApiError(res, "The quotation couldn't be submitted. Please try again."));
    const filed = (await res.json()) as { lead: { id: string; ref: string }; existing: boolean };
    setSubmitted({ number: meta.number, id: filed.lead.id, ref: filed.lead.ref });
    return filed;
  }

  function openSend() {
    setNote(null);
    if (missing.customer || missing.company) {
      setShowErrors(true);
      setNote({ tone: "error", text: "Enter the customer's name and company to send the quotation." });
      customerRef.current?.focus();
      return;
    }
    setSending(true);
  }

  async function submit() {
    setNote(null);
    if (missing.customer || missing.company) {
      setShowErrors(true);
      setNote({ tone: "error", text: "Enter the customer's name and company to submit the quotation." });
      customerRef.current?.focus();
      return;
    }
    setBusy("submit");
    try {
      const { lead, existing } = await fileLead();
      setNote({
        tone: "ok",
        text: existing
          ? `This quotation is already in Leads as ${lead.ref}.`
          : leadId
            ? `Submitted. The quotation is filed on ${lead.ref}, ${draft.companyName.trim()}.`
            : `Submitted. ${draft.companyName.trim()} is now in Leads as ${lead.ref}.`,
        lead,
      });
    } catch (err) {
      setNote({ tone: "error", text: err instanceof Error ? err.message : "The quotation couldn't be submitted. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    onDraftChange(emptyQuoteDraft());
    setSubmitted(null);
    setNote(null);
    setShowErrors(false);
    customerRef.current?.focus();
  }

  const field = (key: keyof typeof ids, label: string, value: string, change: (v: string) => void, opts: { type?: string; required?: boolean; ref?: React.Ref<HTMLInputElement>; autoComplete?: string; placeholder?: string; invalid?: boolean }) => (
    <div>
      <label htmlFor={ids[key]} className="text-sm font-medium text-slate-700">
        {label}
        {opts.required ? <span className="text-muted"> (required)</span> : null}
      </label>
      <input
        id={ids[key]}
        ref={opts.ref}
        type={opts.type ?? "text"}
        value={value}
        maxLength={opts.type === "email" ? 200 : 120}
        autoComplete={opts.autoComplete ?? "off"}
        placeholder={opts.placeholder}
        aria-invalid={opts.invalid || undefined}
        aria-describedby={opts.invalid ? `${ids[key]}-error` : undefined}
        onChange={(e) => change(e.target.value)}
        className={`${FIELD} ${opts.invalid ? "border-red-400" : "border-slate-300"}`}
      />
      {opts.invalid ? (
        <p id={`${ids[key]}-error`} className="mt-1 text-xs text-red-700">
          Needed to submit the quotation.
        </p>
      ) : null}
    </div>
  );

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-canvas">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            Generate quotation
          </h2>
          <p className="text-xs tabular-nums text-muted">
            {meta.number} · valid until {longDate(meta.validUntil)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" busy={busy === "print"} onClick={() => void print()}>
            {busy === "print" ? null : <Printer size={15} aria-hidden />}
            Print
          </Button>
          <Button variant="secondary" busy={busy === "pdf"} onClick={() => void download()}>
            {busy === "pdf" ? null : <Download size={15} aria-hidden />}
            Download PDF
          </Button>
          {emailConfigured || callOrganizer ? (
            <Button variant="secondary" onClick={openSend}>
              <Mail size={15} aria-hidden />
              Send to customer
            </Button>
          ) : null}
          <Button variant={submittedNow ? "success" : "primary"} busy={busy === "submit"} disabled={submittedNow} onClick={() => void submit()}>
            {busy === "submit" ? null : submittedNow ? <Check size={15} aria-hidden /> : <Send size={15} aria-hidden />}
            {submittedNow ? "Submitted" : "Submit as lead"}
          </Button>
          <button
            type="button"
            aria-label="Close the quotation"
            onClick={onClose}
            className="rounded-md p-2 text-muted transition-colors duration-150 hover:bg-canvas hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:overflow-hidden">
        <form
          // Enter in a field mustn't submit a lead by accident: that takes the button.
          onSubmit={(e: FormEvent) => e.preventDefault()}
          noValidate
          className="space-y-6 border-b border-line bg-surface p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r"
        >
          {note ? (
            note.tone === "error" ? (
              <ErrorBanner message={note.text} />
            ) : (
              <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <p className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span>{note.text}</span>
                </p>
                {note.lead ? (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-6">
                    <Link href={`/leads/${note.lead.id}`} className="font-medium underline-offset-2 hover:underline">
                      Open {note.lead.ref}
                    </Link>
                    <button type="button" onClick={startOver} className="font-medium underline-offset-2 hover:underline">
                      Start a new quotation
                    </button>
                  </div>
                ) : null}
              </div>
            )
          ) : null}

          <fieldset className="min-w-0 space-y-3">
            <legend className="mb-1 text-sm font-semibold text-ink">Customer</legend>
            {field("customer", "Customer name", draft.customerName, (v) => set({ customerName: v }), {
              required: true,
              ref: customerRef,
              placeholder: "Who the quotation is for",
              invalid: showErrors && missing.customer,
            })}
            {field("company", "Company name", draft.companyName, (v) => set({ companyName: v }), {
              required: true,
              placeholder: "Their company",
              invalid: showErrors && missing.company,
            })}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {field("email", "E-mail", draft.email, (v) => set({ email: v }), { type: "email", ref: emailRef, placeholder: "name@company.com" })}
              {field("phone", "Phone", draft.phone, (v) => set({ phone: v }), { type: "tel", placeholder: "+90 …" })}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="text-sm font-semibold text-ink">Services, a month</legend>
            <p className="mt-0.5 text-xs text-muted">
              Pay-as-you-go at the volumes in the business case. Untick a service to leave it out: its cost goes, and so do the hours it would have freed. Prices can be changed here.
            </p>
            <ul className="mt-2 divide-y divide-line/70 rounded-lg border border-line bg-white px-3">
              {allLines.map((l) => {
                const included = !excluded.has(l.item);
                // The phone line carries the voice AI's minutes and the notes come from its transcripts: without it, neither applies.
                const withVoice = (l.item === "phone" || l.item === "notes") && excluded.has("voice");
                const key = LINE_PRICE[l.item];
                const boxId = `${servicesId}-${l.item}`;
                return (
                  <li key={l.item} className="py-2">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id={boxId}
                        checked={included}
                        disabled={withVoice}
                        onChange={(e) => includeService(l.item, e.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 accent-brand disabled:opacity-40"
                      />
                      <label htmlFor={boxId} className={`min-w-0 flex-1 text-sm font-medium ${included ? "text-ink" : "text-muted"}`}>
                        {l.label}
                      </label>
                      <span className={`shrink-0 text-sm tabular-nums ${included ? "font-medium text-ink" : "text-muted"}`}>{included ? eur(l.cost) : "Left out"}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-[26px] text-xs text-muted">
                      {withVoice ? (
                        <span>Goes with the voice AI.</span>
                      ) : (
                        <>
                          <span>{basisLead(l)}</span>
                          <span className="inline-flex rounded-md transition-shadow focus-within:ring-2 focus-within:ring-blue-100">
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={l.unit === "month" ? 10 : 0.001}
                              aria-label={`${l.label}: price in euros ${UNIT_WORDS[l.unit]}`}
                              value={rates[key]}
                              disabled={!included}
                              onChange={(e) => setRate(key, e.target.value)}
                              onBlur={() => settleRate(key)}
                              className="w-[4.75rem] min-w-0 rounded-l-md border border-slate-300 bg-white px-2 py-1 text-right text-xs font-medium tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-canvas disabled:text-muted"
                            />
                            <span aria-hidden className="flex items-center rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-1.5 text-xs text-slate-500">
                              €
                            </span>
                          </span>
                          <span>{UNIT_WORDS[l.unit]}</span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 flex items-baseline justify-between gap-3 text-sm font-semibold text-ink" aria-live="polite">
              <span>Total a month</span>
              <span className="tabular-nums">
                {eur(report.running.monthlyCost)} <span className="font-normal text-muted">· {eur(report.running.annualCost)} a year</span>
              </span>
            </p>
            {draft.excluded.length || !pricesAreDefault ? (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {draft.excluded.length ? (
                  <button type="button" onClick={() => set({ excluded: [] })} className={LINK_BUTTON}>
                    Include every service
                  </button>
                ) : null}
                {!pricesAreDefault ? (
                  <button type="button" onClick={restorePrices} className={LINK_BUTTON}>
                    Restore list prices
                  </button>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="text-sm font-semibold text-ink">{PILOT_DAYS}-day pilot</legend>
            <p className="mt-0.5 text-xs text-muted">One call flow or one desk first, with the measures it is judged on and a four-phase plan.</p>
            <select
              aria-label={`${PILOT_DAYS}-day pilot`}
              value={draft.pilot}
              onChange={(e) => choosePilot(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">No pilot: the full services</option>
              {PILOTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="text-sm font-semibold text-ink">Bill review, paid from its savings</legend>
            <p className="mt-0.5 text-xs text-muted">
              Optional: a share of the savings bill review verifies, instead of a price per bill. No saving, no fee. Leave empty to leave it out.
            </p>
            <label className="mt-2 flex items-center gap-2 text-sm text-ink">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={1}
                aria-label="Share of verified savings, percent"
                value={draft.gainshare}
                onChange={(e) => set({ gainshare: e.target.value })}
                className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              % of the verified savings
            </label>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="text-sm font-semibold text-ink">Service charges</legend>
            <p className="mt-0.5 text-xs text-muted">
              Our one-time charges, listed apart from the services. Leave the amount empty to show a charge as included.
            </p>
            <ul className="mt-2 space-y-2">
              {draft.services.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={160}
                    autoComplete="off"
                    aria-label={`Service charge ${i + 1}`}
                    placeholder={SERVICE_HINTS[i] ?? "Service charge"}
                    value={s.description}
                    onChange={(e) => setService(s.id, { description: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <div className="flex w-28 shrink-0 rounded-lg transition-shadow focus-within:ring-2 focus-within:ring-blue-100">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={100}
                      aria-label={`Service charge ${i + 1} amount (euros)`}
                      placeholder="0"
                      value={s.amount}
                      onChange={(e) => setService(s.id, { amount: e.target.value })}
                      className="w-full min-w-0 rounded-l-lg border border-slate-300 bg-white px-2.5 py-2 text-right text-sm font-medium tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none"
                    />
                    <span aria-hidden className="flex shrink-0 items-center rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 px-2 text-sm text-slate-500">
                      €
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove service charge ${i + 1}`}
                    onClick={() => removeService(s.id)}
                    className="shrink-0 rounded-md p-1.5 text-muted transition-colors duration-150 hover:bg-canvas hover:text-ink"
                  >
                    <X size={15} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => set({ services: [...draft.services, blankService()] })}
              disabled={draft.services.length >= MAX_SERVICES}
              className={`mt-2 ${LINK_BUTTON} disabled:cursor-not-allowed disabled:text-muted`}
            >
              <Plus size={15} aria-hidden />
              Add a service charge
            </button>
          </fieldset>

          <p className="border-t border-line pt-4 text-xs text-muted">
            The volumes and assumptions come from the business case. Close this to change them; what you enter here stays.
          </p>
        </form>

        <div className="p-4 sm:p-6 lg:overflow-y-auto">
          <div ref={previewRef}>
            <QuotationPreview report={report} meta={meta} />
          </div>
        </div>
      </div>

      {sending ? (
        <ProposeCall
          title="Send to the customer"
          organizer={callOrganizer}
          customerName={draft.customerName.trim()}
          companyName={draft.companyName.trim()}
          email={draft.email.trim()}
          quoteNumber={meta.number}
          mentioned={leadContext?.mentioned}
          consent={leadContext?.consent ?? null}
          // After a first meeting, the call comes first; the quotation follows the scoping call.
          initial={{ quotation: !callOrganizer, invite: Boolean(callOrganizer) }}
          emailQuotation={emailConfigured ? emailQuotation : undefined}
          filesQuotation
          fileLead={async () => (await fileLead()).lead}
          onBooked={({ meeting, filed }) =>
            setNote({
              tone: "ok",
              text: `${meeting.withQuotation ? `Quotation ${meta.number} and a Teams call` : "Teams call"} for ${describeCallSlot(meeting.startsAt, meeting.endsAt, meeting.timeZone)}, sent in one e-mail to ${meeting.attendees.join(", ")}${filed ? `. The call is on ${filed.ref}` : ""}.`,
              lead: filed ?? undefined,
            })
          }
          onEmailed={(to) => setNote({ tone: "ok", text: `Quotation ${meta.number} sent to ${to.join(", ")}, with the PDF attached.` })}
          onClose={() => setSending(false)}
        />
      ) : null}
    </div>,
    document.body
  );
}
