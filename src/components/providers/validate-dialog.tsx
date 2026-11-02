"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, PhoneOutgoing, X } from "lucide-react";
import { NumberPicker, type NumberEntry } from "@/components/calls/number-picker";
import { Button, ErrorBanner, SectionTitle, Spinner, readApiError } from "@/components/ui";
import { formatMoney, maskPhone } from "@/lib/format";
import { VOICE_LANGUAGES } from "@/lib/voice/languages";

// ---------------------------------------------------------------------------
// "Validate by phone": Ada rings the practice on behalf of the network team.
// At the booth the number is the presenter's own (or a visitor's, approved on
// the spot with the consent tick), so whoever answers plays the front desk.
// The call shows live here; when it ends, what the practice said is on the
// record.
// ---------------------------------------------------------------------------

interface Options {
  telephonyConfigured: boolean;
  numbers: NumberEntry[];
}

interface CallView {
  id: string;
  ref: string;
  status: string;
  durationSec: number | null;
  summary: string | null;
  outcome: {
    providerValidation?: {
      reached_right_place?: boolean;
      operating?: boolean | null;
      hours?: string;
      services_confirmed?: string[];
      services_not_offered?: string[];
      accepts_direct_billing?: boolean | null;
      prices?: { item: string; amount: number; currency: string }[];
      contact_name?: string;
      contact_role?: string;
      closed_or_moved?: string;
      new_address?: string;
    } | null;
    priceLinkSent?: { channel?: string; to?: string; sent?: boolean } | null;
  } | null;
}

const FINAL = ["COMPLETED", "FAILED", "NO_ANSWER", "BUSY", "VOICEMAIL", "CANCELED", "TRANSFERRED"];
const STATUS_TEXT: Record<string, string> = {
  QUEUED: "Dialling…",
  RINGING: "Ringing…",
  IN_PROGRESS: "On the call",
  COMPLETED: "Call ended",
  FAILED: "The call failed",
  NO_ANSWER: "No answer",
  BUSY: "Busy",
  VOICEMAIL: "Voicemail",
  CANCELED: "Cancelled",
  TRANSFERRED: "Handed to a person",
};

const fieldClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none";

export function ValidateDialog({ providerRef, providerName, phone, onClose, onDone }: { providerRef: string; providerName: string; phone: string | null; onClose: () => void; onDone?: () => void }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [to, setTo] = useState("");
  const [language, setLanguage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [call, setCall] = useState<CallView | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    fetch("/api/calls/outbound/options")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: Options | null) => {
        if (!body) return;
        setOptions(body);
        setTo((current) => current || body.numbers[0]?.number || "");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Follow the call until it ends.
  useEffect(() => {
    if (!call || FINAL.includes(call.status)) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      setElapsed(Math.round((Date.now() - started) / 1000));
      const res = await fetch(`/api/calls/${call.id}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const next = (await res.json()).call as CallView;
      setCall(next);
      if (FINAL.includes(next.status) && !doneRef.current) {
        doneRef.current = true;
        // The record updates a moment after the call ends; refresh after that.
        setTimeout(() => onDone?.(), 2500);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [call, onDone]);

  async function place() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(providerRef)}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, language: language || undefined }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The call could not be placed."));
        return;
      }
      const body = (await res.json()) as { call: { id: string; ref: string; status: string } };
      setCall({ id: body.call.id, ref: body.call.ref, status: body.call.status, durationSec: null, summary: null, outcome: null });
    } catch {
      setError("The call could not be placed — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const v = call?.outcome?.providerValidation ?? null;
  const ended = call ? FINAL.includes(call.status) : false;

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Validate by phone" className="animate-modal-in w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <SectionTitle>Validate by phone</SectionTitle>
            <p className="mt-1 text-sm text-muted">
              Ada rings <span className="font-semibold text-ink">{providerName}</span> for the network team: does it exist and operate at the address, hours, services, direct billing, a few prices, and she sends the price-list link.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-canvas hover:text-ink" aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>

        {!call ? (
          <div className="mt-4 space-y-3">
            {options ? (
              options.telephonyConfigured ? (
                <>
                  <NumberPicker
                    label="Phone to ring (whoever answers plays the front desk)"
                    value={to}
                    onChange={setTo}
                    numbers={options.numbers}
                    onNumbers={(numbers) => setOptions({ ...options, numbers })}
                    suggested={phone ? { number: phone, tag: "practice" } : null}
                    disabled={busy}
                  />
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Language</span>
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className={fieldClass} disabled={busy}>
                      <option value="">English (switches if they answer in another language)</option>
                      {VOICE_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.name}>
                          {l.native === l.name ? l.name : `${l.native} · ${l.name}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  {error ? <ErrorBanner message={error} /> : null}
                  <Button onClick={() => void place()} busy={busy} disabled={!to} className="w-full">
                    <PhoneOutgoing size={15} aria-hidden /> Call {to ? maskPhone(to) : "the number"} now
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted">The phone line isn&apos;t connected on this server, so validation calls can&apos;t be placed here.</p>
              )
            ) : (
              <Spinner label="Loading the approved numbers…" />
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-sm">
              {!ended ? <span className="h-2.5 w-2.5 animate-live-ping rounded-full bg-live" aria-hidden /> : <Check size={15} className="text-emerald-600" aria-hidden />}
              <span className="font-semibold text-ink">{STATUS_TEXT[call.status] ?? call.status}</span>
              <span className="text-muted">
                · {maskPhone(to)} ·{" "}
                <Link href={`/calls/${call.id}`} className="font-semibold text-brand hover:underline">
                  {call.ref}
                </Link>
              </span>
              {!ended ? <span className="ms-auto tabular-nums text-muted">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span> : call.durationSec != null ? <span className="ms-auto tabular-nums text-muted">{call.durationSec}s</span> : null}
            </div>
            {!ended ? <p className="text-xs text-muted">Pick up and play the front desk: confirm the address, give opening hours, say which services you offer, whether you bill assistance companies directly, and a price or two.</p> : null}
            {call.summary ? <p className="rounded-xl border border-line p-3 text-sm text-ink">{call.summary}</p> : null}
            {v ? (
              <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                <Fact label="Reached the practice">{v.reached_right_place == null ? "—" : v.reached_right_place ? "yes" : "no"}</Fact>
                <Fact label="Operating at the address">{v.operating == null ? "—" : v.operating ? "yes" : "no"}</Fact>
                {v.hours ? <Fact label="Hours">{v.hours}</Fact> : null}
                {v.accepts_direct_billing != null ? <Fact label="Direct billing">{v.accepts_direct_billing ? "yes" : "no, patients pay"}</Fact> : null}
                {v.services_confirmed?.length ? <Fact label="Confirmed">{v.services_confirmed.join(", ")}</Fact> : null}
                {v.services_not_offered?.length ? <Fact label="Not offered">{v.services_not_offered.join(", ")}</Fact> : null}
                {v.prices?.length ? <Fact label="Prices">{v.prices.map((q) => `${q.item}: ${formatMoney(q.amount, q.currency)}`).join(" · ")}</Fact> : null}
                {v.contact_name ? <Fact label="Spoke to">{`${v.contact_name}${v.contact_role ? ` (${v.contact_role})` : ""}`}</Fact> : null}
                {v.closed_or_moved ? <Fact label="Closed or moved">{v.closed_or_moved}</Fact> : null}
                {v.new_address ? <Fact label="New address">{v.new_address}</Fact> : null}
                {call.outcome?.priceLinkSent ? <Fact label="Price-list link">{call.outcome.priceLinkSent.sent ? `sent by ${call.outcome.priceLinkSent.channel} to ${call.outcome.priceLinkSent.to}` : "not sent"}</Fact> : null}
              </dl>
            ) : null}
            {ended ? (
              <div className="flex justify-end">
                <Button onClick={onClose}>Done</Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
