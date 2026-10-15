"use client";

import Link from "next/link";
import { ArrowRight, Info, Mic, MicOff, PhoneCall, PhoneOff, ShieldAlert } from "lucide-react";
import { Button, Card, ErrorBanner, PageHeader } from "@/components/ui";
import { CaseContextBanner, useCaseContext } from "@/components/case-context";
import { CallVisual, type CallVisualState } from "@/components/voice/call-visual";
import { ActivityPanel, BookingPanel, ProvidersPanel } from "@/components/voice/session-panels";
import { TranscriptPanel } from "@/components/voice/transcript-panel";
import { useQueryParam } from "@/lib/client/use-query-param";
import { useGrokVoice, type VoiceState } from "@/lib/voice/client/use-grok-voice";

function visualState(s: VoiceState): CallVisualState {
  if (s.phase === "starting") return "connecting";
  if (s.phase !== "live") return "idle";
  if (s.agentSpeaking) return "speaking";
  if (s.muted || s.textOnly) return "muted";
  return s.userSpeaking ? "hearing" : "listening";
}

function statusLine(s: VoiceState): { title: string; detail: string } {
  switch (s.phase) {
    case "starting":
      return { title: "Connecting…", detail: "Starting the microphone and the voice agent" };
    case "live":
      return {
        title: s.agentSpeaking ? "Speaking…" : s.muted ? "Muted" : s.textOnly ? "Text mode" : s.userSpeaking ? "Hearing you…" : "Listening…",
        detail: `${s.callRef} · ${s.agentLabel ?? "Voice agent"} · just talk — you can interrupt any time`,
      };
    case "ended":
      return {
        title: "Session ended",
        detail: s.booking || s.handoff ? "Handed to a human case manager with the full summary." : (s.endReason ?? ""),
      };
    case "error":
      return { title: "Not connected", detail: s.error?.message ?? "" };
    default:
      return { title: "Ready", detail: "Press Start to talk to the AI medical assistance agent" };
  }
}

export default function VoicePage() {
  const { state, start, stop, sendText, setMuted } = useGrokVoice();
  const caseId = useQueryParam("caseId");
  const agent = useQueryParam("agent");
  const linkedCase = useCaseContext(caseId);
  const live = state.phase === "live";
  const busy = state.phase === "starting";
  const { title, detail } = statusLine(state);
  const notConfigured = state.error?.code === "VOICE_NOT_CONFIGURED";

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="AI Voice Medical Assistance Agent"
        subtitle="A real voice agent that understands the request, searches providers, confirms, books and files the case — then hands off to a human."
      >
        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
          Grok Voice 3.0 · speech-to-speech
        </span>
      </PageHeader>

      {linkedCase ? <CaseContextBanner kase={linkedCase} action="This voice session works" /> : null}

      {notConfigured ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Voice needs an xAI API key on the server (<code>XAI_API_KEY</code>). Every other module keeps working offline.
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

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <CallVisual state={visualState(state)} />
                <div>
                  <p className="text-xl font-semibold tracking-tight text-slate-900" aria-live="polite">
                    {title}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">{detail}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {live && !state.textOnly ? (
                  <Button variant="secondary" onClick={() => setMuted(!state.muted)} aria-pressed={state.muted}>
                    {state.muted ? <MicOff size={15} aria-hidden /> : <Mic size={15} aria-hidden />}
                    {state.muted ? "Unmute" : "Mute"}
                  </Button>
                ) : null}
                {live || busy ? (
                  <Button variant="danger" onClick={stop}>
                    <PhoneOff size={15} aria-hidden /> End
                  </Button>
                ) : (
                  <Button onClick={() => void start({ caseId: linkedCase?.id, profile: agent ?? undefined })} busy={busy}>
                    <PhoneCall size={15} aria-hidden />
                    {state.phase === "idle" ? "Start" : "Start again"}
                  </Button>
                )}
              </div>
            </div>
            {state.phase === "idle" ? (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
                Demonstration line: all records are fictional — please don&apos;t share real medical details. Your browser
                will ask for microphone access; without it you can type.
              </p>
            ) : null}
          </Card>

          <TranscriptPanel lines={state.transcript} partial={state.partial} live={live} onSend={sendText} />

          {state.booking || state.handoff ? (
            <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
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
        </div>

        <div className="space-y-5">
          <ActivityPanel tools={state.tools} />
          <ProvidersPanel providers={state.providers} onPick={sendText} disabled={!live} />
          <BookingPanel booking={state.booking} caseRef={state.caseRef} />
        </div>
      </div>
    </div>
  );
}
