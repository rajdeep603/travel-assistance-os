"use client";

import Link from "next/link";
import { useState } from "react";
import { Ban, Check, ChevronDown, Inbox, Languages, ShieldCheck, UserRound } from "lucide-react";
import { Button, Card, readApiError } from "@/components/ui";
import type { HowItWorks, ScenarioGroup, VoiceScenario } from "@/lib/voice/demo-scenarios";
import type { VoiceLanguage } from "@/lib/voice/languages";

export interface VoiceCatalog {
  scenarios: VoiceScenario[];
  groups: Record<ScenarioGroup, string>;
  languages: VoiceLanguage[];
}

const fieldClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:opacity-60";

/**
 * Which voice agent to talk to and in what language. Outbound agents run in
 * the browser too: the presenter plays the hospital, doctor or traveller
 * being called, on a ready demo case.
 */
export function AgentPicker({
  catalog,
  agentId,
  language,
  onAgent,
  onLanguage,
  onPrepared,
  disabled,
  caseOverride,
}: {
  catalog: VoiceCatalog;
  agentId: string;
  language: string;
  onAgent: (id: string) => void;
  onLanguage: (name: string) => void;
  /** A prerequisite (e.g. receiving an invoice) was just done: reload the catalog. */
  onPrepared: () => void;
  disabled: boolean;
  /** The case the page was opened for, which replaces the demo case. */
  caseOverride: { id: string; ref: string } | null;
}) {
  const scenario = catalog.scenarios.find((s) => s.agentId === agentId) ?? null;
  const groups = Object.entries(catalog.groups) as [ScenarioGroup, string][];
  const kase = caseOverride ?? scenario?.case ?? null;
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function prepare(sample: string) {
    setPreparing(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "email", sample }),
      });
      if (!res.ok) setError(await readApiError(res, "The sample couldn't be received."));
      else onPrepared();
    } finally {
      setPreparing(false);
    }
  }

  return (
    <Card className="mb-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="block min-w-0">
          <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
            <UserRound size={13} aria-hidden /> Voice agent
          </span>
          <select value={agentId} onChange={(e) => onAgent(e.target.value)} disabled={disabled} className={fieldClass}>
            {groups.map(([key, label]) => (
              <optgroup key={key} label={label}>
                {catalog.scenarios
                  .filter((s) => s.group === key)
                  .map((s) => (
                    <option key={s.agentId} value={s.agentId}>
                      {s.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Languages size={13} aria-hidden /> Language
          </span>
          <select value={language} onChange={(e) => onLanguage(e.target.value)} disabled={disabled} className={fieldClass}>
            <option value="">
              {scenario?.defaultLanguage === "Turkish" ? "Default (Turkish)" : "Auto: follows the caller"}
            </option>
            {catalog.languages.map((l) => (
              <option key={l.code} value={l.name}>
                {l.native === l.name ? l.name : `${l.native} · ${l.name}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {scenario ? (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-muted">{scenario.description}</p>
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            <span>
              <span className="font-semibold text-ink">You play:</span> {scenario.youPlay}
            </span>
            {kase ? (
              <span>
                <span className="font-semibold text-ink">Case:</span>{" "}
                <Link href={`/cases/${kase.id}`} className="font-semibold text-brand underline-offset-2 hover:underline">
                  {kase.ref}
                </Link>
              </span>
            ) : null}
          </p>
          {scenario.needs && !caseOverride ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-ink" role="status">
              <span>{scenario.needs.label}</span>
              {scenario.needs.emailSample ? (
                <Button variant="secondary" busy={preparing} onClick={() => void prepare(scenario.needs!.emailSample!)}>
                  <Inbox size={14} aria-hidden /> Receive it now
                </Button>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
          <HowItWorksPanel how={scenario.howItWorks} />
        </div>
      ) : null}
    </Card>
  );
}

/**
 * What the agent can do, what it never does and when a person takes over:
 * the answer to "what stops it from saying something wrong?".
 */
function HowItWorksPanel({ how }: { how: HowItWorks }) {
  const columns = [
    { title: "What it can do", items: how.can, icon: <Check size={13} className="mt-0.5 shrink-0 text-brand" aria-hidden /> },
    { title: "What it never does", items: how.never, icon: <Ban size={13} className="mt-0.5 shrink-0 text-muted" aria-hidden /> },
    { title: "When a person takes over", items: how.handsOver, icon: <UserRound size={13} className="mt-0.5 shrink-0 text-brand-2" aria-hidden /> },
  ];
  return (
    <details className="group rounded-lg border border-line bg-canvas/60 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <ShieldCheck size={14} className="text-brand" aria-hidden />
        How this agent works
        <ChevronDown size={14} className="ml-auto text-muted transition-transform duration-150 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-4 border-t border-line px-3 py-3 md:grid-cols-3">
        {columns.map((c) => (
          <div key={c.title} className="min-w-0">
            <p className="mb-1.5 font-semibold text-ink">{c.title}</p>
            <ul className="space-y-1 text-muted">
              {c.items.map((item) => (
                <li key={item} className="flex gap-1.5">
                  {c.icon}
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="border-t border-line px-3 py-2 text-muted">
        Says it&apos;s an AI at the start of every call, files everything on the case, and ends the call by itself after{" "}
        <span className="tabular-nums">{how.maxMinutes}</span> minutes.
      </p>
    </details>
  );
}
