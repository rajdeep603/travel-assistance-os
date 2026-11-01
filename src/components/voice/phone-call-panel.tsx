"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Languages, PhoneIncoming, PhoneOutgoing, Smartphone } from "lucide-react";
import { NumberPicker, type NumberEntry } from "@/components/calls/number-picker";
import { Button, Card, ErrorBanner, SectionTitle, readApiError } from "@/components/ui";
import { maskPhone } from "@/lib/format";
import type { VoiceLanguage } from "@/lib/voice/languages";

// ---------------------------------------------------------------------------
// The phone half of a voice demo: the agent on screen rings a real phone, by
// default the presenter's own (the first approved number), about the case the
// step is on. From a demo step, an outbound agent dials it and opens the call
// along the step's script; for an inbound step the step's agent rings it,
// plays a short tone and stays quiet until the presenter reads the caller's
// first line. The audio runs between the phone and the server, so the booth's
// Wi-Fi carries only the click. The call then shows live on the page.
// ---------------------------------------------------------------------------

interface Options {
  telephonyConfigured: boolean;
  numbers: NumberEntry[];
  agents: {
    id: string;
    audience: "traveller" | "provider" | null;
    suggestedNumber: string | null;
    suggestedAllowed: boolean;
  }[];
}

export interface PhoneCallTarget {
  agentId: string;
  agentLabel: string;
  direction: "inbound" | "outbound";
  caseId: string | null;
  caseRef: string | null;
  record: string | null;
  /** Why the agent can't start on this case; null when it can. */
  blocked: string | null;
}

/** The demo step a call rehearses, when it is placed from one. */
export interface PhoneCallStep {
  trackId: string;
  id: string;
  youPlay: string;
}

const fieldClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:opacity-60";

export function PhoneCallPanel({
  target,
  step = null,
  language,
  languages,
  defaultLanguageLabel = "Auto: follows the caller",
  onLanguage,
  disabled,
  onPlaced,
}: {
  target: PhoneCallTarget;
  /** Placed from a demo step: sits in the step card, and the agent gets the step's script as context. */
  step?: PhoneCallStep | null;
  language: string;
  /** When given, a language select sits beside the number. */
  languages?: VoiceLanguage[];
  defaultLanguageLabel?: string;
  onLanguage?: (name: string) => void;
  disabled: boolean;
  /** A call is on its way: show it live. */
  onPlaced: (call: { id: string; ref: string } | null) => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ id: string; ref: string; to: string } | null>(null);
  const outbound = target.direction === "outbound";

  useEffect(() => {
    const q = target.caseId ? `?caseId=${encodeURIComponent(target.caseId)}` : "";
    fetch(`/api/calls/outbound/options${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: Options | null) => {
        if (!body) return;
        setOptions(body);
        // The presenter's own phone first (configured numbers lead the list).
        setTo((current) => current || (body.numbers[0]?.number ?? ""));
      })
      .catch(() => undefined);
  }, [target.caseId, target.agentId]);

  // A new step or agent: the last call's status no longer applies.
  useEffect(() => {
    setPlaced(null);
    setError(null);
  }, [target.agentId, target.caseId, target.record, step?.id]);

  async function call() {
    setBusy(true);
    setError(null);
    try {
      const demo = step ? { run: step.trackId, step: step.id } : undefined;
      const res = outbound
        ? await fetch("/api/calls/outbound", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profile: target.agentId,
              caseId: target.caseId ?? undefined,
              to,
              language: language || undefined,
              record: target.record ?? undefined,
              demo,
            }),
          })
        : await fetch("/api/calls/ring-me", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to, language: language || undefined, demo }),
          });
      if (!res.ok) {
        setError(await readApiError(res, "The call could not be placed."));
        return;
      }
      const body = (await res.json()) as { call: { id: string; ref: string } };
      setPlaced({ id: body.call.id, ref: body.call.ref, to });
      onPlaced({ id: body.call.id, ref: body.call.ref });
    } catch {
      setError("The call could not be placed — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!options) return null;
  if (!options.telephonyConfigured) {
    return step ? (
      <p className="text-xs text-muted">The phone line isn&apos;t connected on this server, so this step runs in the browser.</p>
    ) : (
      <Card>
        <SectionTitle>Call by phone</SectionTitle>
        <p className="mt-2 text-xs text-muted">The phone line isn&apos;t connected on this server, so this step runs in the browser.</p>
      </Card>
    );
  }
  const agent = options.agents.find((a) => a.id === target.agentId);
  const suggested = agent?.suggestedNumber ? { number: agent.suggestedNumber, tag: agent.audience === "provider" ? "hospital" : "patient" } : null;
  const cannot = target.blocked;
  const other = agent?.audience === "provider" ? "hospital" : "traveller";

  const picker = (
    <NumberPicker
      label="Phone to ring"
      value={to}
      onChange={setTo}
      numbers={options.numbers}
      onNumbers={(numbers) => setOptions({ ...options, numbers })}
      suggested={suggested}
      disabled={busy || disabled}
    />
  );
  const button = (
    <Button onClick={() => void call()} busy={busy} disabled={!to || Boolean(cannot) || disabled} className="w-full">
      {outbound ? <PhoneOutgoing size={15} aria-hidden /> : <PhoneIncoming size={15} aria-hidden />}
      {outbound ? `Call ${to ? maskPhone(to) : "the number"} now` : `Ring ${to ? maskPhone(to) : "the phone"} now`}
    </Button>
  );
  const status = (
    <>
      {cannot ? <p className="text-xs text-warn">{cannot}</p> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {placed ? (
        <p className="text-sm text-emerald-700" role="status">
          {outbound ? "Calling" : "Ringing"} {maskPhone(placed.to)}: pick up.{" "}
          <Link href={`/calls/${placed.id}`} className="font-semibold underline">
            {placed.ref}
          </Link>{" "}
          shows live below as soon as the call connects.
        </p>
      ) : null}
    </>
  );

  if (step) {
    return (
      <div data-testid="phone-call-panel" className="rounded-xl border border-brand/30 bg-brand/5 p-3 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            <Smartphone size={15} className="text-brand" aria-hidden /> Call my phone
          </p>
          <p className="text-xs text-muted">
            {outbound ? (
              <>
                <span className="font-semibold text-ink">{target.agentLabel}</span> rings this phone and opens the call about{" "}
                <span className="font-semibold text-ink">{target.caseRef ?? target.record ?? "the record"}</span>, as it would the real {other}: answer with
                the lines above.
              </>
            ) : (
              <>
                <span className="font-semibold text-ink">{target.agentLabel}</span> rings this phone and stays quiet: pick up, wait for the tone, then read
                the first line. It answers as on a dialled-in call.
              </>
            )}{" "}
            Only the click needs this Wi-Fi: the call itself runs on the phone.
          </p>
        </div>
        {/* Number and language side by side from phones up; the button joins the row only where it fits on one line. */}
        <div className={`mt-3 grid gap-3 sm:items-start ${languages ? "sm:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]" : "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"}`}>
          {picker}
          {languages ? (
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
                <Languages size={13} aria-hidden /> Language
              </span>
              <select value={language} onChange={(e) => onLanguage?.(e.target.value)} disabled={busy || disabled} className={fieldClass}>
                <option value="">{defaultLanguageLabel}</option>
                {languages.map((l) => (
                  <option key={l.code} value={l.name}>
                    {l.native === l.name ? l.name : `${l.native} · ${l.name}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className={`min-w-0 ${languages ? "sm:col-span-2 xl:col-span-1" : ""}`}>
            {/* Keeps the button level with the fields beside their labels when it shares their row. */}
            <span className={`mb-1 hidden text-xs ${languages ? "xl:block" : "sm:block"}`} aria-hidden>
              &nbsp;
            </span>
            {button}
          </div>
        </div>
        <div className="mt-2 space-y-2 empty:hidden">{status}</div>
      </div>
    );
  }

  return (
    // The Card doesn't forward data attributes; the wrapper carries the test id.
    <div data-testid="phone-call-panel">
      <Card>
        <SectionTitle>Call by phone</SectionTitle>
        <p className="mt-2 text-xs text-muted">
          {outbound ? (
            <>
              <span className="font-semibold text-ink">{target.agentLabel}</span> rings this number and talks about{" "}
              <span className="font-semibold text-ink">{target.caseRef ?? target.record ?? "the record"}</span>, as it would the real {other}. Whoever
              answers plays that side.
            </>
          ) : (
            <>
              The 24/7 hotline rings this number and greets whoever answers, exactly as on a dialled-in call. A visitor&apos;s own mobile works: add it
              with its country code.
            </>
          )}
        </p>
        <div className="mt-3 space-y-2">
          {picker}
          {status}
          {button}
        </div>
      </Card>
    </div>
  );
}
