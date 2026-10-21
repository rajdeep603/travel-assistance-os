"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCircle2, Download, Mail, Plus, Printer, Send, X } from "lucide-react";
import { Button, ErrorBanner, readApiError } from "@/components/ui";
import { QuotationPreview } from "@/components/quotation/quotation-preview";
import { businessCaseReport, longDate, quoteMeta, type BusinessCaseInput, type QuoteDetails } from "@/lib/business-case";
import { PILOT_DAYS, PILOTS, pilotPlan } from "@/lib/pilots";
import { printElement } from "@/lib/client/print";
import { zonedToday } from "@/lib/time";

// ---------------------------------------------------------------------------
// Generate quotation: the customer's details and Sthiram's service charges on
// the left, the quotation exactly as it will print on the right. From here it
// prints, downloads, goes by e-mail, or is submitted as a lead.
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
  };
}

const FIELD =
  "mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-base text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

type Note = { tone: "ok" | "error"; text: string; lead?: { id: string; ref: string } };

export function QuotationWorkspace({
  base,
  draft,
  onDraftChange,
  onClose,
  leadId = null,
}: {
  base: Omit<BusinessCaseInput, "quote">;
  draft: QuoteDraft;
  onDraftChange: (draft: QuoteDraft) => void;
  onClose: () => void;
  /** An existing lead (a visitor from the QR page) the quotation is filed on, instead of opening a new one. */
  leadId?: string | null;
}) {
  const [today] = useState(() => zonedToday());
  const input: BusinessCaseInput = useMemo(() => ({ ...base, quote: draftToQuote(draft) }), [base, draft]);
  const report = useMemo(() => businessCaseReport(input), [input]);
  const meta = useMemo(() => quoteMeta(input, today), [input, today]);

  const [busy, setBusy] = useState<"pdf" | "print" | "email" | "submit" | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [submitted, setSubmitted] = useState<{ number: string; id: string; ref: string } | null>(null);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const ids = { customer: useId(), company: useId(), email: useId(), phone: useId() };

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Open as a page of its own: keyboard to the first field, Escape closes, the
  // page behind stays still, and focus goes back where it was on the way out.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    customerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
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

  const submittedNow = submitted?.number === meta.number;
  const missing = { customer: !draft.customerName.trim(), company: !draft.companyName.trim() };

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

  async function email() {
    setNote(null);
    if (!draft.email.trim()) {
      setNote({ tone: "error", text: "Enter the customer's e-mail address to send the quotation." });
      emailRef.current?.focus();
      return;
    }
    setBusy("email");
    try {
      const res = await fetch("/api/business-case/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: draft.email.trim(), input }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "The e-mail couldn't be sent. Please try again."));
      setNote({ tone: "ok", text: `Quotation ${meta.number} sent to ${draft.email.trim()}, with the PDF attached.` });
    } catch (err) {
      setNote({ tone: "error", text: err instanceof Error ? err.message : "The e-mail couldn't be sent. Please try again." });
    } finally {
      setBusy(null);
    }
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
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, ...(leadId ? { leadId } : {}) }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "The quotation couldn't be submitted. Please try again."));
      const { lead, existing } = (await res.json()) as { lead: { id: string; ref: string }; existing: boolean };
      setSubmitted({ number: meta.number, id: lead.id, ref: lead.ref });
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
          {emailConfigured ? (
            <Button variant="secondary" busy={busy === "email"} onClick={() => void email()}>
              {busy === "email" ? null : <Mail size={15} aria-hidden />}
              E-mail
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
              className="mt-2 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-deep disabled:cursor-not-allowed disabled:text-muted"
            >
              <Plus size={15} aria-hidden />
              Add a service charge
            </button>
          </fieldset>

          <p className="border-t border-line pt-4 text-xs text-muted">
            The services and their prices come from the business case. Close this to change them; what you enter here stays.
          </p>
        </form>

        <div className="p-4 sm:p-6 lg:overflow-y-auto">
          <div ref={previewRef}>
            <QuotationPreview report={report} meta={meta} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
