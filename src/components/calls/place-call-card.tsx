"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PhoneOutgoing } from "lucide-react";
import { Button, Card, ErrorBanner, SectionTitle, readApiError } from "@/components/ui";
import { maskPhone } from "@/lib/format";
import { VOICE_LANGUAGES } from "@/lib/voice/languages";

interface Options {
  telephonyConfigured: boolean;
  allowedNumbers: string[];
  agents: {
    id: string;
    label: string;
    description: string;
    audience: "traveller" | "provider" | null;
    suggestedNumber: string | null;
    suggestedAllowed: boolean;
  }[];
}

/** Lets an operator have an AI agent call the hospital or traveller about this case. */
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

  function pick(id: string) {
    setAgentId(id);
    setPlaced(null);
    setError(null);
    const a = options?.agents.find((x) => x.id === id);
    setTo(a?.suggestedAllowed && a.suggestedNumber ? a.suggestedNumber : options?.allowedNumbers[0] ?? "");
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

  return (
    <Card>
      <SectionTitle>AI phone calls</SectionTitle>
      {!options.telephonyConfigured ? (
        <p className="mt-2 text-xs text-slate-500">Telephony isn&apos;t configured on this server, so AI agents can&apos;t place calls.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {options.agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => pick(a.id)}
              aria-pressed={agentId === a.id}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                agentId === a.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"
              }`}
            >
              <span className="flex items-center gap-2 font-medium text-slate-800">
                <PhoneOutgoing size={14} className="text-blue-600" aria-hidden /> {a.label}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">{a.description}</span>
            </button>
          ))}
          {agent ? (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              {options.allowedNumbers.length === 0 ? (
                <p className="text-xs text-amber-700">No numbers are approved for AI calls yet, so nothing can be called.</p>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Number to call</span>
                  <select
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
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
                <p className="text-xs text-slate-500">
                  The {agent.audience === "provider" ? "hospital's" : "patient's"} number ({maskPhone(agent.suggestedNumber)}) isn&apos;t on the approved call list.
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
                <PhoneOutgoing size={15} aria-hidden /> Call now
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
