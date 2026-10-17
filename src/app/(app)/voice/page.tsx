"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Info, Mic, MicOff, PhoneCall, PhoneOff, ShieldAlert } from "lucide-react";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { CaseContextBanner, useCaseContext } from "@/components/case-context";
import { AgentPicker, type VoiceCatalog } from "@/components/voice/agent-picker";
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

export default function VoicePage() {
  const { state, start, stop, sendText, setMuted, getLevels } = useGrokVoice();
  const urlCaseId = useQueryParam("caseId");
  const urlAgent = useQueryParam("agent");
  const urlLanguage = useQueryParam("lang");
  const [agentId, setAgentId] = useState(DEFAULT_AGENT);
  const [language, setLanguage] = useState("");
  const [catalog, setCatalog] = useState<VoiceCatalog | null>(null);
  useEffect(() => {
    if (urlAgent) setAgentId(urlAgent);
  }, [urlAgent]);
  useEffect(() => {
    if (urlLanguage) setLanguage(urlLanguage);
  }, [urlLanguage]);

  const loadCatalog = useCallback(() => {
    fetch("/api/voice/agents")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => body && setCatalog(body))
      .catch(() => undefined);
  }, []);
  useEffect(loadCatalog, [loadCatalog]);

  // An agent the picker doesn't offer (say, an old link) falls back to the default.
  useEffect(() => {
    if (catalog && !catalog.scenarios.some((s) => s.agentId === agentId)) setAgentId(DEFAULT_AGENT);
  }, [catalog, agentId]);
  const scenario = catalog?.scenarios.find((s) => s.agentId === agentId) ?? null;
  // Opened from a case, the session is for that case; otherwise outbound agents use their demo case.
  const caseId = urlCaseId ?? (scenario?.direction === "outbound" ? (scenario.case?.id ?? null) : null);
  const linkedCase = useCaseContext(caseId);
  const live = state.phase === "live";
  const busy = state.phase === "starting";
  const { title, detail } = statusLine(state, scenario?.label ?? null);
  const notConfigured = state.error?.code === "VOICE_NOT_CONFIGURED";

  /** Keeps the choice in the address bar, so a refresh or a shared link reopens it. */
  function remember(next: { agent?: string; lang?: string }) {
    const params = new URLSearchParams(window.location.search);
    if (next.agent !== undefined) params.set("agent", next.agent);
    if (next.lang !== undefined) {
      if (next.lang) params.set("lang", next.lang);
      else params.delete("lang");
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }

  // When the session went live, for the stage's call timer.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (live) setStartedAt((t) => t ?? Date.now());
    else if (busy) setStartedAt(null);
  }, [live, busy]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Voice Agents"
        subtitle="Pick an agent and a language, then play the other side: a traveller, a hospital desk or a treating doctor. Every call is filed on the case."
      />

      {catalog ? (
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
          disabled={live || busy}
          caseOverride={urlCaseId && linkedCase ? { id: linkedCase.id, ref: linkedCase.ref } : null}
        />
      ) : null}

      {linkedCase && urlCaseId ? <CaseContextBanner kase={linkedCase} action="This voice session works" /> : null}

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

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
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
                  onClick={() => void start({ caseId: caseId ?? undefined, profile: agentId, language: language || undefined })}
                  className="inline-flex h-14 items-center gap-2.5 rounded-full bg-brand px-7 text-base font-semibold text-white shadow-lg shadow-brand/30 transition-colors duration-150 hover:bg-brand-deep focus-visible:outline-brand-2 active:scale-[0.98]"
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
        {/* The transcript fills the stage's height and scrolls, never stretches the row. */}
        <div className="relative lg:col-span-2">
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

      {state.booking || state.handoff ? (
        <div className="animate-fade-up mt-5 flex flex-wrap items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <span className="text-sm font-semibold text-emerald-700">AI completed</span>
          <ArrowRight size={16} className="text-emerald-500" aria-hidden />
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
