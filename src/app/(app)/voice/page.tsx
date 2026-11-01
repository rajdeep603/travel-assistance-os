"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Info, Mic, MicOff, PhoneCall, PhoneOff, ShieldAlert } from "lucide-react";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { CaseContextBanner, useCaseContext } from "@/components/case-context";
import { AgentPicker, blockedReason, type VoiceCatalog } from "@/components/voice/agent-picker";
import { DemoRunStrip, type ResolvedStep } from "@/components/voice/demo-run-strip";
import { PhoneCallPanel } from "@/components/voice/phone-call-panel";
import { LiveBoard } from "@/components/calls/live-board";
import { BookingPanel, ProvidersPanel, ResultsPanel } from "@/components/voice/session-panels";
import { TranscriptPanel } from "@/components/voice/transcript-panel";
import { StageButton, VoiceStage } from "@/components/voice/voice-stage";
import type { OrbState } from "@/components/voice/voice-orb";
import { useQueryParam } from "@/lib/client/use-query-param";
import { useGrokVoice, type VoiceState } from "@/lib/voice/client/use-grok-voice";
import { toolActivityLabel } from "@/lib/voice/tool-labels";

function orbState(s: VoiceState): OrbState {
  if (s.phase === "starting") return "connecting";
  if (s.phase !== "live") return "idle";
  if (s.agentSpeaking) return "speaking";
  if (s.tools.some((t) => t.status === "running")) return "tool";
  if (s.thinking) return "thinking";
  if (s.muted || s.textOnly) return "muted";
  return s.userSpeaking ? "hearing" : "listening";
}

function statusLine(s: VoiceState, agentLabel: string | null): { title: string; detail: string } {
  switch (s.phase) {
    case "starting":
      return { title: "Connecting…", detail: "Starting the microphone and the voice agent" };
    case "live": {
      const running = s.tools.findLast((t) => t.status === "running");
      const title = s.agentSpeaking
        ? "Speaking…"
        : running
          ? `${toolActivityLabel(running.name)}…`
          : s.thinking
            ? "Thinking…"
            : s.muted
              ? "Muted"
              : s.textOnly
                ? "Text mode"
                : s.userSpeaking
                  ? "Hearing you…"
                  : "Listening…";
      return { title, detail: s.textOnly ? "Type below; the agent answers out loud" : "Just talk. You can interrupt at any time." };
    }
    case "ended":
      return {
        title: "Session ended",
        detail: s.booking || s.handoff ? "Handed to a human case manager with the full summary." : (s.endReason ?? ""),
      };
    case "error":
      return { title: "Not connected", detail: s.error?.message ?? "" };
    default:
      return { title: "Ready when you are", detail: agentLabel ? `Start a conversation with the ${agentLabel.toLowerCase()} agent` : "Start a conversation with the AI medical assistance agent" };
  }
}

/** Agents whose sessions are about finding and booking care. */
const BOOKING_AGENTS = new Set(["appointment-booking", "inbound-hotline"]);
const DEFAULT_AGENT = "appointment-booking";

/** Keeps the choice in the address bar, so a refresh or a shared link reopens it. */
function remember(next: Partial<Record<"agent" | "lang" | "caseId" | "record" | "run" | "step", string | null>>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue;
    if (value) params.set(key, value);
    else params.delete(key);
  }
  window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
}

export default function VoicePage() {
  const { state, start, stop, sendText, setMuted, getLevels } = useGrokVoice();
  const urlCaseId = useQueryParam("caseId");
  const urlAgent = useQueryParam("agent");
  const urlLanguage = useQueryParam("lang");
  const urlRecord = useQueryParam("record");
  const urlRun = useQueryParam("run");
  const urlStep = useQueryParam("step");
  const [agentId, setAgentId] = useState(DEFAULT_AGENT);
  const [language, setLanguage] = useState("");
  // The case every agent is judged on: the one the page was opened for, or one
  // picked here ("Use CASE-1021", a demo-run step). Without one, each agent brings its demo case.
  const [caseOverrideId, setCaseOverrideId] = useState<string | null>(null);
  const [recordRef, setRecordRef] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<VoiceCatalog | null>(null);
  // A phone call placed from here shows live under the stage (the gateway's monitor feed).
  const [liveMonitorUrl, setLiveMonitorUrl] = useState<string | null>(null);
  useEffect(() => {
    if (urlAgent) setAgentId(urlAgent);
  }, [urlAgent]);
  useEffect(() => {
    if (urlLanguage) setLanguage(urlLanguage);
  }, [urlLanguage]);
  useEffect(() => {
    if (urlCaseId) setCaseOverrideId(urlCaseId);
  }, [urlCaseId]);
  useEffect(() => {
    if (urlRecord) setRecordRef(urlRecord);
  }, [urlRecord]);

  const loadCatalog = useCallback(() => {
    fetch(`/api/voice/agents${caseOverrideId ? `?caseId=${encodeURIComponent(caseOverrideId)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => body && setCatalog(body))
      .catch(() => undefined);
  }, [caseOverrideId]);
  useEffect(loadCatalog, [loadCatalog]);

  // An agent the picker doesn't offer (say, an old link) falls back to the default.
  useEffect(() => {
    if (catalog && !catalog.scenarios.some((s) => s.agentId === agentId)) setAgentId(DEFAULT_AGENT);
  }, [catalog, agentId]);
  const scenario = catalog?.scenarios.find((s) => s.agentId === agentId) ?? null;
  // The catalogue judged every agent on the chosen case, or gave each its demo case.
  const caseId = scenario?.case?.id ?? null;
  const linkedCase = useCaseContext(caseId);
  // An outbound agent starts only on a case (or record) that gives it something to call about.
  const blocked = blockedReason(scenario);
  const live = state.phase === "live";
  const busy = state.phase === "starting";
  const { title, detail } = statusLine(state, scenario?.label ?? null);
  const notConfigured = state.error?.code === "VOICE_NOT_CONFIGURED";

  /** Judges every agent on this case from now on (the ready demo case the picker offered). */
  function pickCase(kase: { id: string } | null) {
    setCaseOverrideId(kase?.id ?? null);
    remember({ caseId: kase?.id ?? null });
  }

  /** A demo-run step: its agent, case (or record) and language, all at once. */
  const openStep = useCallback((step: ResolvedStep) => {
    setAgentId(step.agentId);
    if (step.language) setLanguage(step.language);
    setCaseOverrideId(step.case?.id ?? null);
    setRecordRef(step.record ?? null);
    remember({ agent: step.agentId, lang: step.language ?? undefined, caseId: step.case?.id ?? null, record: step.record ?? null, run: step.trackId, step: step.id });
  }, []);

  // When the session went live, for the stage's call timer.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (live) setStartedAt((t) => t ?? Date.now());
    else if (busy) setStartedAt(null);
  }, [live, busy]);

  return (
    // No floating assistant here (see AssistantLauncher), so no room kept for it.
    <div data-fab-free className="mx-auto max-w-7xl">
      <PageHeader
        title="Voice Agents"
        subtitle="Pick an agent and a language, then play the other side: a traveller, a hospital desk or a treating doctor. Every call is filed on the case."
      />

      <DemoRunStrip
        initialTrackId={urlRun}
        initialStepId={urlStep}
        onStep={openStep}
        onTrack={(id) => remember({ run: id, step: null })}
        onPrepared={loadCatalog}
        disabled={live || busy}
      />

      {linkedCase && caseOverrideId ? <CaseContextBanner kase={linkedCase} action="This voice session works" /> : null}

      {notConfigured ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Voice isn&apos;t available on this server right now. Every other module keeps working.
          </span>
        </div>
      ) : state.phase === "error" && state.error ? (
        <div className="mb-4">
          <ErrorBanner message={state.error.message} />
        </div>
      ) : state.textOnly && state.error ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          <MicOff size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{state.error.message} The session continues — the agent speaks and you can type.</span>
        </div>
      ) : null}

      {/* Phones and portrait tablets: picker, stage, transcript. Wider: the stage on the left
          from the top of the page, the picker above the transcript beside it. */}
      <div className="grid gap-5 lg:grid-cols-5 lg:grid-rows-[auto_minmax(0,1fr)]">
        <div className="min-w-0 lg:col-span-2 lg:col-start-4 lg:row-start-1">
          {catalog ? (
            <div className="space-y-5">
              <AgentPicker
                catalog={catalog}
                agentId={agentId}
                language={language}
                onAgent={(id) => {
                  setAgentId(id);
                  remember({ agent: id });
                }}
                onLanguage={(name) => {
                  setLanguage(name);
                  remember({ lang: name });
                }}
                onPrepared={loadCatalog}
                onUseCase={pickCase}
                disabled={live || busy}
              />
              {scenario ? (
                <PhoneCallPanel
                  target={{
                    agentId: scenario.agentId,
                    agentLabel: scenario.label,
                    direction: scenario.direction,
                    caseId: scenario.case?.id ?? null,
                    caseRef: scenario.case?.ref ?? null,
                    record: recordRef ?? scenario.record?.ref ?? null,
                    blocked,
                  }}
                  language={language}
                  disabled={live || busy}
                  onPlaced={() => {
                    fetch("/api/calls/config")
                      .then((r) => (r.ok ? r.json() : null))
                      .then((c) => c && setLiveMonitorUrl(c.monitorUrl))
                      .catch(() => undefined);
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 lg:col-span-3 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <VoiceStage
            orb={orbState(state)}
            getLevels={getLevels}
            title={title}
            detail={detail}
            live={live}
            startedAt={startedAt}
            callRef={state.callRef}
            agentLabel={state.agentLabel}
            transcript={state.transcript}
            partialAgent={state.partial.agent}
            tools={state.tools}
            booking={state.booking}
            idleHint={scenario ? `Try: ${scenario.tryLine}` : "Try: “I’m in Taksim and I need to see a doctor tomorrow afternoon.”"}
            controls={
              live || busy ? (
                <>
                  {live && !state.textOnly ? (
                    <StageButton label={state.muted ? "Unmute" : "Mute"} pressed={state.muted} onClick={() => setMuted(!state.muted)}>
                      {state.muted ? <MicOff size={22} aria-hidden /> : <Mic size={22} aria-hidden />}
                    </StageButton>
                  ) : null}
                  <StageButton label="End the session" tone="danger" onClick={stop}>
                    <PhoneOff size={22} aria-hidden />
                  </StageButton>
                </>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(blocked)}
                  title={blocked ?? undefined}
                  onClick={() => void start({ caseId: caseId ?? undefined, profile: agentId, language: language || undefined, record: recordRef ?? scenario?.record?.ref })}
                  className="inline-flex h-14 items-center gap-2.5 rounded-full bg-brand px-7 text-base font-semibold text-white shadow-lg shadow-brand/30 transition-colors duration-150 hover:bg-brand-deep focus-visible:outline-brand-2 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PhoneCall size={19} aria-hidden />
                  {state.phase === "idle" ? "Start conversation" : "Start again"}
                </button>
              )
            }
            footnote={
              state.phase === "idle" ? (
                <p className="flex items-start gap-2">
                  <Info size={14} className="mt-px shrink-0" aria-hidden />
                  Demonstration line: all records are fictional, so please don&apos;t share real medical details. Your
                  browser will ask for the microphone; without it you can type.
                </p>
              ) : null
            }
          />
        </div>
        {/* The transcript fills the height left beside the stage and scrolls, never stretches the row. */}
        <div className="relative min-w-0 lg:col-span-2 lg:col-start-4 lg:row-start-2 lg:min-h-[260px]">
          <TranscriptPanel
            lines={state.transcript}
            partial={state.partial}
            partialAgentId={state.partialAgentId}
            live={live}
            onSend={sendText}
            className="h-[440px] lg:absolute lg:inset-0 lg:h-auto"
            hint={scenario ? `You play: ${scenario.youPlay.toLowerCase()}.` : undefined}
          />
        </div>
      </div>

      {liveMonitorUrl ? (
        <div className="animate-fade-up mt-5">
          <LiveBoard monitorUrl={liveMonitorUrl} />
        </div>
      ) : null}

      {state.booking || state.handoff ? (
        <div className="animate-fade-up mt-5 flex flex-wrap items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <span className="text-sm font-semibold text-emerald-700">AI completed</span>
          <ArrowRight size={16} className="text-emerald-500 rtl:rotate-180" aria-hidden />
          <span className="text-sm font-semibold text-emerald-700">
            {state.handoff?.target === "doctor" ? "On-call doctor" : "Human case manager"}
          </span>
          <span className="text-xs text-emerald-700">
            — they see the transcript and summary
            {state.caseRef ? (
              <>
                {" "}
                in{" "}
                <Link href={`/cases/${state.caseRef.id}`} className="font-semibold underline">
                  {state.caseRef.ref}
                </Link>
              </>
            ) : null}
            .
          </span>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {BOOKING_AGENTS.has(agentId) ? (
          <>
            <ProvidersPanel providers={state.providers} onPick={sendText} disabled={!live} />
            <BookingPanel booking={state.booking} caseRef={state.caseRef} />
          </>
        ) : null}
        {!BOOKING_AGENTS.has(agentId) || state.results.length ? (
          <ResultsPanel results={state.results} caseRef={state.caseRef ?? (linkedCase ? { id: linkedCase.id, ref: linkedCase.ref } : null)} />
        ) : null}
      </div>
    </div>
  );
}
