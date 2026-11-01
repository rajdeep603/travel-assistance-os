"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronDown, Mic, PhoneOutgoing } from "lucide-react";
import { Button, Card, ErrorBanner, SectionTitle, readApiError } from "@/components/ui";
import { maskPhone } from "@/lib/format";
import type { AgentFit } from "@/lib/voice/agents/types";
import { VOICE_LANGUAGES } from "@/lib/voice/languages";

interface AgentOption {
  id: string;
  label: string;
  description: string;
  audience: "traveller" | "provider" | null;
  suggestedNumber: string | null;
  suggestedAllowed: boolean;
  browser: boolean;
  /** Whether this case gives the agent something to call about; null when it isn't judged. */
  fit: AgentFit | null;
}

interface Options {
  telephonyConfigured: boolean;
  voiceConfigured: boolean;
  allowedNumbers: string[];
  agents: AgentOption[];
}

const fits = (a: AgentOption) => !a.fit || a.fit.ready;

/**
 * The AI calls this case gives something to call about: rehearsed in the
 * browser (the operator plays the other side) or placed on the phone. Agents
 * the case doesn't fit are listed apart, with the reason, so nobody starts a
 * reminder call on a case with no appointment.
 */
export function PlaceCallCard({ caseId }: { caseId: string }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [agentId, setAgentId] = useState("");
  const [to, setTo] = useState("");
  const [language, setLanguage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ id: string; ref: string } | null>(null);

  useEffect(() => {
    fetch(`/api/calls/outbound/options?caseId=${encodeURIComponent(caseId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setOptions)
      .catch(() => setOptions(null));
  }, [caseId]);

  const agent = options?.agents.find((a) => a.id === agentId);
  const fitting = options?.agents.filter(fits) ?? [];
  const unfit = options?.agents.filter((a) => !fits(a)) ?? [];

  function pick(id: string) {
    setAgentId(id === agentId ? "" : id);
    setPlaced(null);
    setError(null);
    const a = options?.agents.find((x) => x.id === id);
    setTo(a?.suggestedAllowed && a.suggestedNumber ? a.suggestedNumber : (options?.allowedNumbers[0] ?? ""));
  }

  async function call() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/calls/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: agentId, caseId, to, language: language || undefined }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The call could not be placed."));
        return;
      }
      setPlaced((await res.json()).call);
    } catch {
      setError("The call could not be placed — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!options) return null;
  const canPhone = options.telephonyConfigured;

  return (
    <Card>
      <SectionTitle>AI calls about this case</SectionTitle>
      {fitting.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Nothing on this case gives an AI agent something to call about yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {fitting.map((a) => {
            const selected = agentId === a.id;
            return (
              <li key={a.id} className={`rounded-xl border p-3 text-sm transition-colors ${selected ? "border-brand bg-brand/10" : "border-line"}`}>
                <p className="flex items-center gap-2 font-medium text-ink">
                  <PhoneOutgoing size={14} className="text-brand" aria-hidden /> {a.label}
                </p>
                <p className="mt-0.5 text-xs text-muted">{a.description}</p>
                {a.fit?.record ? (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-muted">
                    <Check size={13} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                    <span>Calls about {a.fit.record}.</span>
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {a.browser && options.voiceConfigured ? (
                    <Link
                      href={`/voice?agent=${encodeURIComponent(a.id)}&caseId=${encodeURIComponent(caseId)}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand/40"
                    >
                      <Mic size={13} className="text-brand" aria-hidden /> Rehearse in browser
                    </Link>
                  ) : null}
                  {canPhone ? (
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => pick(a.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand/40 aria-pressed:border-brand"
                    >
                      <PhoneOutgoing size={13} className="text-brand" aria-hidden /> {selected ? "Choose the number below" : "Call by phone"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!canPhone && fitting.length ? <p className="mt-2 text-xs text-muted">The phone line isn&apos;t connected on this server, so calls run in the browser.</p> : null}

      {agent && canPhone ? (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {options.allowedNumbers.length === 0 ? (
            <p className="text-xs text-amber-700">No numbers are approved for AI calls yet, so nothing can be called.</p>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Number to call</span>
              <select
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
              >
                {options.allowedNumbers.map((n) => (
                  <option key={n} value={n}>
                    {n}
                    {n === agent.suggestedNumber ? (agent.audience === "provider" ? " (hospital)" : " (patient)") : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            >
              <option value="">Agent&apos;s default</option>
              {VOICE_LANGUAGES.map((l) => (
                <option key={l.code} value={l.name}>
                  {l.native === l.name ? l.name : `${l.native} · ${l.name}`}
                </option>
              ))}
            </select>
          </label>
          {agent.suggestedNumber && !agent.suggestedAllowed ? (
            <p className="text-xs text-muted">
              {agent.audience === "provider" ? "The hospital's number" : "The patient's number"} ({maskPhone(agent.suggestedNumber)}) isn&apos;t on the approved call list.
            </p>
          ) : null}
          {error ? <ErrorBanner message={error} /> : null}
          {placed ? (
            <p className="text-sm text-emerald-700">
              Calling now —{" "}
              <Link href={`/calls/${placed.id}`} className="font-semibold underline">
                {placed.ref}
              </Link>{" "}
              (follow it live in the Call Center).
            </p>
          ) : null}
          <Button onClick={call} busy={busy} disabled={!to} className="w-full">
            <PhoneOutgoing size={15} aria-hidden /> Call {agent.label.toLowerCase()} now
          </Button>
        </div>
      ) : null}

      {unfit.length ? (
        <details className="group mt-3 rounded-lg border border-line bg-canvas/60 text-xs">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 font-semibold text-ink [&::-webkit-details-marker]:hidden">
            Not for this case ({unfit.length})
            <ChevronDown size={14} className="ml-auto text-muted transition-transform duration-150 group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="space-y-1.5 border-t border-line px-3 py-2 text-muted">
            {unfit.map((a) => (
              <li key={a.id}>
                <span className="font-medium text-ink">{a.label}:</span> {a.fit?.why}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
