"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Globe, Headset, PhoneIncoming, PhoneOutgoing, Settings2 } from "lucide-react";
import { CallScripts } from "@/components/calls/call-scripts";
import { LiveBoard } from "@/components/calls/live-board";
import { Card, EmptyState, ErrorBanner, PageHeader, SectionTitle, SkeletonRows, StatusBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

interface CallsConfig {
  hotlineNumber: string | null;
  telephonyConfigured: boolean;
  voiceConfigured: boolean;
  monitorUrl: string;
  transferTargets: { doctor: boolean; caseManager: boolean };
  agents: { id: string; label: string; description: string; direction: string; channels: string[] }[];
}

interface CallRow {
  id: string;
  ref: string;
  direction: "INBOUND" | "OUTBOUND";
  channel: "PHONE" | "BROWSER";
  agentLabel: string;
  status: string;
  startedAt: string;
  durationSec: number | null;
  fromNumber: string | null;
  toNumber: string | null;
  summary: string | null;
  case: { id: string; ref: string } | null;
}

/** "+15550100199" → "+1 555 010 0199" (display only). */
function displayNumber(n: string): string {
  const m = n.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+1 ${m[1]} ${m[2]} ${m[3]}`;
  return n.replace(/(\+\d{2})(\d{3})(\d{3})(\d+)/, "$1 $2 $3 $4");
}

function duration(sec: number | null): string {
  if (sec == null) return "—";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** Widens the last agent card so the grid's final row has no empty cells. */
function lastAgentSpan(count: number): string {
  const odd = count % 2 === 1; // two columns: portrait tablets and laptops
  const rest = count % 3; // three columns: landscape tablets
  return [
    odd ? "sm:col-span-2" : "",
    rest === 1 ? "lg:col-span-3" : rest === 2 ? "lg:col-span-2" : "lg:col-span-1",
    odd ? "xl:col-span-2" : "xl:col-span-1",
  ].join(" ");
}

export default function CallsPage() {
  const [config, setConfig] = useState<CallsConfig | null>(null);
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCalls = useCallback(async () => {
    try {
      const res = await fetch("/api/calls");
      if (!res.ok) throw new Error();
      setCalls((await res.json()).calls ?? []);
    } catch {
      setError("The call history could not be loaded — please refresh.");
    }
  }, []);

  useEffect(() => {
    fetch("/api/calls/config")
      .then((r) => (r.ok ? r.json() : null))
      .then(setConfig)
      .catch(() => setConfig(null));
    void loadCalls();
  }, [loadCalls]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Call Center"
        subtitle="AI voice agents answer every call and place outbound calls — live transcripts, tool activity and outcomes, with humans one transfer away."
      >
      </PageHeader>
      {error ? (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {/* Side by side on laptops; stacked on tablets, so neither card is squeezed. */}
      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <SectionTitle>24/7 AI assistance hotline</SectionTitle>
          {config?.hotlineNumber ? (
            <>
              <a
                href={`tel:${config.hotlineNumber}`}
                className="mt-3 flex items-center gap-3 whitespace-nowrap text-[1.7rem] font-semibold tracking-tight text-ink hover:text-brand xl:text-3xl"
              >
                <Headset size={30} className="shrink-0 text-brand" aria-hidden />
                {displayNumber(config.hotlineNumber)}
              </a>
              <p className="mt-2 text-sm text-slate-600">
                Call now: emergencies, coverage questions (“Is my flight delay covered?”), appointments, case and claim status. Hospitals use the
                same number.
              </p>
              <p className="mt-2 text-xs text-muted">
                Warm transfer: doctor {config.transferTargets.doctor ? "on call" : "not configured"} · case manager{" "}
                {config.transferTargets.caseManager ? "on call" : "not configured"}
              </p>
            </>
          ) : (
            <p className="mt-3 flex items-start gap-2 text-sm text-slate-600">
              <Settings2 size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />
              {config && !config.telephonyConfigured
                ? "The phone line isn't connected on this server yet."
                : "Loading…"}
            </p>
          )}
          <CallScripts doctorOnCall={config?.transferTargets.doctor ?? true} rehearse={config?.voiceConfigured ?? false} />
        </Card>

        <Card className="xl:col-span-2">
          <SectionTitle>Voice agents</SectionTitle>
          {config ? (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2">
              {config.agents.map((a, i) => (
                <li
                  key={a.id}
                  className={`rounded-lg border border-slate-200 p-3 ${i === config.agents.length - 1 ? lastAgentSpan(config.agents.length) : ""}`}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    {a.direction === "outbound" ? (
                      <PhoneOutgoing size={14} className="text-blue-600" aria-hidden />
                    ) : (
                      <PhoneIncoming size={14} className="text-blue-600" aria-hidden />
                    )}
                    {a.label}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{a.description}</p>
                  {a.channels.includes("BROWSER") && a.id !== "interpreter" && config.voiceConfigured ? (
                    <Link href={`/voice?agent=${a.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                      <Globe size={12} aria-hidden /> Try it in the browser
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3">
              <SkeletonRows rows={2} />
            </div>
          )}
        </Card>
      </div>

      <div className="mb-5">
        {/* Calls exist only where voice or telephony is set up (as LiveRefresh does); elsewhere, Plan B's bare `next start` included, there's no gateway to listen to. */}
        <LiveBoard monitorUrl={config && (config.voiceConfigured || config.telephonyConfigured) ? config.monitorUrl : null} onCallEnded={() => void loadCalls()} />
      </div>

      <Card>
        <SectionTitle>Recent calls</SectionTitle>
        {calls === null ? (
          <div className="mt-3">
            <SkeletonRows rows={4} />
          </div>
        ) : calls.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No calls yet" hint="Call the hotline or start a web voice session." />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Call</th>
                  <th className="py-2 pr-3 font-medium">Agent · caller</th>
                  <th className="py-2 pr-3 font-medium">Started · length</th>
                  <th className="py-2 pr-3 font-medium">Case</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calls.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="py-2.5 pr-3">
                      <Link href={`/calls/${c.id}`} className="flex items-center gap-1.5 font-semibold text-blue-600 hover:underline">
                        {c.channel === "BROWSER" ? (
                          <Globe size={13} aria-hidden />
                        ) : c.direction === "OUTBOUND" ? (
                          <PhoneOutgoing size={13} aria-hidden />
                        ) : (
                          <PhoneIncoming size={13} aria-hidden />
                        )}
                        {c.ref}
                      </Link>
                      {c.summary ? <p className="mt-0.5 line-clamp-2 max-w-md text-xs text-slate-500">{c.summary}</p> : null}
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="text-slate-700">{c.agentLabel}</p>
                      <p className="mt-0.5 whitespace-nowrap text-xs text-slate-500">
                        {(c.direction === "INBOUND" ? c.fromNumber : c.toNumber) ?? (c.channel === "BROWSER" ? "Web" : "—")}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="whitespace-nowrap text-slate-500">{formatDateTime(c.startedAt)}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-slate-500">{duration(c.durationSec)}</p>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3">
                      {c.case ? (
                        <Link href={`/cases/${c.case.id}`} className="text-blue-600 hover:underline">
                          {c.case.ref}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <StatusBadge value={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
