"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Mic, MicOff, PhoneCall, PhoneForwarded, PhoneOff, Send, XCircle } from "lucide-react";
import { VoiceOrb, type OrbState } from "@/components/voice/voice-orb";
import { CallResult } from "@/components/partner-demo/call-result";
import { LANGUAGE_TR, type PortalCopy } from "@/lib/partner-demo/copy";
import type { PortalLang, Scenario, VoiceOption } from "@/lib/partner-demo/kit";
import { useGrokVoice, type VoiceState } from "@/lib/voice/client/use-grok-voice";
import { toolActivityLabel } from "@/lib/voice/tool-labels";
import { toolSteps } from "@/lib/voice/tool-steps";

function orbState(s: VoiceState): OrbState {
  if (s.phase === "starting") return "connecting";
  if (s.phase !== "live") return "idle";
  if (s.agentSpeaking) return "speaking";
  if (s.tools.some((t) => t.status === "running")) return "tool";
  if (s.thinking) return "thinking";
  if (s.muted || s.textOnly) return "muted";
  return s.userSpeaking ? "hearing" : "listening";
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, Math.floor(sec % 60))).padStart(2, "0")}`;

/** What is being said right now: the agent's sentence in progress, else the last line. */
function caption(state: VoiceState) {
  if (state.partial.agent) return { role: "agent" as const, text: state.partial.agent };
  const last = state.transcript[state.transcript.length - 1];
  if (!last) return null;
  const text = last.text.length > 180 ? `…${last.text.slice(-180).replace(/^\S*\s/, "")}` : last.text;
  return { role: last.role, text };
}

export function VoiceScenario({
  token,
  scenario,
  copy,
  lang,
  voiceAvailable,
  remainingSeconds,
  onSessionChange,
}: {
  token: string;
  scenario: Scenario;
  copy: PortalCopy;
  lang: PortalLang;
  voiceAvailable: boolean;
  remainingSeconds: number;
  onSessionChange: () => void;
}) {
  const t = copy.tryIt;
  const { state, start, stop, sendText, setMuted, getLevels } = useGrokVoice();
  const [language, setLanguage] = useState(scenario.languages?.[0]?.name ?? "");
  const [scriptId, setScriptId] = useState(scenario.scripts[0]?.id ?? "");
  const [callRef, setCallRef] = useState<string | null>(null);
  const [maxSeconds, setMaxSeconds] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [typed, setTyped] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  const script = scenario.scripts.find((s) => s.id === scriptId) ?? scenario.scripts[0];
  const live = state.phase === "live";
  const busy = state.phase === "starting";
  const ownLines = script?.say[language] ?? null;
  // A language without its own lines shows the English ones (else the Turkish
  // ones, with their gloss) for the tester to say in the chosen language.
  const lines = ownLines ?? script?.say.English ?? script?.say.Turkish ?? null;
  // The interpreter's card shows the doctor's Turkish lines and the patient's lines in the chosen language.
  const doctorLines = scenario.id === "interpreter" ? script?.say.Turkish ?? [] : [];
  const featured = scenario.languages?.filter((l) => l.featured) ?? [];
  const others = (scenario.languages?.filter((l) => !l.featured) ?? [])
    .map((l) => ({ ...l, text: languageText(l, lang) }))
    .sort((a, b) => a.text.localeCompare(b.text, lang));

  useEffect(() => {
    if (live) setStartedAt((s) => s ?? Date.now());
  }, [live]);
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  useEffect(() => {
    if (state.phase === "ended" || state.phase === "error") onSessionChange();
  }, [state.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.transcript.length, state.partial.agent]);

  async function begin() {
    setCallRef(null);
    setStartedAt(null);
    setMaxSeconds(null);
    const info = (await start({ scenario: scenario.id, script: script?.id, language, ui: lang }, `/api/public/partner-demo/${encodeURIComponent(token)}/session`)) as
      | (Awaited<ReturnType<typeof start>> & { maxSeconds?: number })
      | null;
    if (info) {
      setCallRef(info.call.ref);
      setMaxSeconds(info.maxSeconds ?? null);
      onSessionChange();
    }
  }

  const left = live && startedAt && maxSeconds ? Math.max(0, maxSeconds - (now - startedAt) / 1000) : null;
  const steps = useMemo(() => toolSteps(state.tools), [state.tools]);
  const said = caption(state);
  const s = t.stage;
  const title =
    state.phase === "starting"
      ? s.connecting
      : state.phase === "live"
        ? state.agentSpeaking
          ? s.speaking
          : state.thinking
            ? s.thinking
            : state.muted
              ? s.muted
              : state.textOnly
                ? s.textMode
                : state.userSpeaking
                  ? s.hearing
                  : s.listening
        : state.phase === "ended"
          ? s.ended
          : state.phase === "error"
            ? s.error
            : s.ready;
  const detail =
    state.phase === "starting" ? s.connectingDetail : state.phase === "live" ? (state.textOnly ? s.textDetail : s.liveDetail) : state.phase === "ended" ? s.endedDetail : s.readyDetail;

  const errorText = (() => {
    const code = state.error?.code;
    if (state.phase !== "error" || !state.error) return null;
    if (code === "BUDGET_USED") return t.budgetUsed;
    if (code === "BUSY") return t.busy;
    if (code === "VOICE_NOT_CONFIGURED") return t.voiceOff;
    const m = state.error.message;
    if (m.startsWith("The voice connection failed")) return t.connectionFailed;
    if (m.startsWith("Could not reach the server")) return t.serverUnreachable;
    if (m.startsWith("The voice service is unavailable")) return t.voiceUnavailable;
    return m;
  })();
  const outOfTime = remainingSeconds < 45;

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    if (!typed.trim()) return;
    sendText(typed);
    setTyped("");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-5">
        {/* The role card: who you are, what you know, what to say, what to watch. */}
        <div className="space-y-4 lg:col-span-2">
          {scenario.scripts.length > 1 ? (
            <div role="radiogroup" aria-label={t.script} className="flex flex-wrap gap-2">
              {scenario.scripts.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  role="radio"
                  aria-checked={sc.id === script?.id}
                  disabled={live || busy}
                  onClick={() => setScriptId(sc.id)}
                  className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors duration-150 disabled:opacity-60 ${
                    sc.id === script?.id ? "bg-brand text-white bg-brand-gradient shadow-glow" : "border border-line bg-surface text-ink hover:border-brand/40"
                  }`}
                >
                  {sc.title[lang]}
                </button>
              ))}
            </div>
          ) : null}

          {scenario.languages?.length ? (
            <label className="block">
              <span className="text-xs font-medium text-muted">{scenario.languageLabel?.[lang]}</span>
              <select
                value={language}
                disabled={live || busy}
                onChange={(e) => setLanguage(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 md:text-sm"
              >
                {featured.length && others.length ? (
                  <>
                    <optgroup label={t.languagesFeatured}>
                      {featured.map((l) => (
                        <option key={l.name} value={l.name}>
                          {languageText(l, lang)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={t.languagesOther}>
                      {others.map((l) => (
                        <option key={l.name} value={l.name}>
                          {l.text}
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  scenario.languages.map((l) => (
                    <option key={l.name} value={l.name}>
                      {languageText(l, lang)}
                    </option>
                  ))
                )}
              </select>
            </label>
          ) : null}

          {script ? (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <p className="text-xs font-medium text-muted">{t.roleTitle}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-ink">{script.youPlay[lang]}</p>

              <p className="mt-4 text-xs font-medium text-muted">{t.factsTitle}</p>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {script.facts.map((f) => (
                  <div key={f.label.en} className="contents">
                    <dt className="text-muted">{f.label[lang]}</dt>
                    <dd className="font-medium text-ink">{f.value[lang]}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-4 text-xs font-medium text-muted">{t.sayTitle}</p>
              {doctorLines.length ? <SayList heading={t.doctorSays} lines={doctorLines} lang={lang} /> : null}
              {lines?.length && !ownLines ? <p className="mt-1.5 text-sm text-muted">{t.sayOther}</p> : null}
              {lines?.length ? (
                <SayList heading={doctorLines.length ? t.patientSays : undefined} lines={lines} lang={lang} />
              ) : (
                <p className="mt-1.5 text-sm text-muted">{t.sayOther}</p>
              )}

              <p className="mt-4 text-xs font-medium text-muted">{t.watchTitle}</p>
              <ul className="mt-1.5 space-y-1.5 text-sm text-ink">
                {script.watch.map((w) => (
                  <li key={w.en} className="flex gap-2">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                    <span>{w[lang]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* The stage and the conversation. */}
        <div className="space-y-4 lg:col-span-3">
          <section aria-label={scenario.title[lang]} className="relative overflow-hidden rounded-3xl bg-stage text-stage-ink shadow-xl shadow-stage/20">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[360px]" style={{ background: "radial-gradient(closest-side, rgb(var(--c-brand) / 0.18), transparent)" }} />
            <div className="relative flex items-center justify-between gap-3 px-5 pt-5 text-sm">
              <p className="min-w-0 truncate text-stage-muted">
                {callRef ? <span className="font-medium tabular-nums text-stage-ink">{callRef}</span> : scenario.title[lang]}
              </p>
              {live && left != null ? (
                <span className="flex shrink-0 items-center gap-2 rounded-full bg-stage-raised px-3 py-1 text-xs font-medium tabular-nums">
                  <span className="relative flex h-2 w-2" aria-hidden>
                    <span className="animate-live-ping absolute inset-0 rounded-full bg-live" />
                    <span className="relative h-2 w-2 rounded-full bg-live" />
                  </span>
                  {mmss(left)} {s.timeLeft}
                </span>
              ) : null}
            </div>
            <div className="relative flex flex-col items-center px-5 pb-6 pt-1 text-center">
              <VoiceOrb state={orbState(state)} getLevels={getLevels} size={196} />
              <p className="-mt-2 text-2xl font-semibold tracking-tight" aria-live="polite">
                {title}
              </p>
              <p className="mt-1 max-w-md text-sm text-stage-muted">{detail}</p>
              <div className="mt-4 flex min-h-[4.5rem] w-full max-w-xl items-center justify-center">
                {said ? (
                  <p className={`text-lg font-medium leading-snug ${said.role === "user" ? "text-live" : "text-stage-ink"}`}>
                    <span className="sr-only">{said.role === "user" ? `${t.you}: ` : `${t.agent}: `}</span>
                    {said.text}
                  </p>
                ) : null}
              </div>
              {state.handoff ? (
                <p className="animate-pop-in mt-1 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                  <PhoneForwarded size={16} aria-hidden />
                  {copy.result.handoffTo(state.handoff.target)}
                </p>
              ) : state.booking ? (
                <p className="animate-pop-in mt-1 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                  <CheckCircle2 size={16} aria-hidden />
                  {state.booking.appointment.ref} · {state.booking.appointment.facility}
                </p>
              ) : null}

              {steps.length ? (
                <div className="mt-4 w-full max-w-xl text-start">
                  <p className="mb-2 text-xs font-medium text-stage-muted">{s.steps}</p>
                  <ul className="space-y-1.5">
                    {steps.map((step) => (
                      <li key={step.id} className="flex items-center gap-2 text-sm">
                        {step.status === "running" ? (
                          <Loader2 size={15} className="shrink-0 animate-spin text-brand-2" aria-hidden />
                        ) : step.status === "error" ? (
                          <XCircle size={15} className="shrink-0 text-warn" aria-hidden />
                        ) : (
                          <CheckCircle2 size={15} className="shrink-0 text-live" aria-hidden />
                        )}
                        <span>{copy.tools[step.name]?.[step.status === "running" ? 0 : 1] ?? toolActivityLabel(step.name)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-6 flex items-center justify-center gap-3">
                {live || busy ? (
                  <>
                    {live && !state.textOnly ? (
                      <button
                        type="button"
                        onClick={() => setMuted(!state.muted)}
                        aria-pressed={state.muted}
                        aria-label={state.muted ? t.unmute : t.mute}
                        className="flex h-14 w-14 items-center justify-center rounded-full bg-stage-raised text-stage-ink ring-1 ring-stage-line transition-colors duration-150 hover:bg-stage-line"
                      >
                        {state.muted ? <MicOff size={22} aria-hidden /> : <Mic size={22} aria-hidden />}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={stop}
                      aria-label={t.end}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-900/30 transition-colors duration-150 hover:bg-red-700"
                    >
                      <PhoneOff size={22} aria-hidden />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={!voiceAvailable || outOfTime}
                    onClick={() => void begin()}
                    className="inline-flex h-14 items-center gap-2.5 rounded-full bg-brand bg-brand-gradient px-7 text-base font-semibold text-white shadow-glow transition-transform duration-150 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PhoneCall size={19} aria-hidden />
                    {state.phase === "idle" ? t.start : t.startAgain}
                  </button>
                )}
              </div>
              {state.phase === "idle" ? <p className="mt-4 max-w-md text-xs text-stage-muted">{t.micNote}</p> : null}
            </div>
          </section>

          {errorText ? (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {errorText}
            </p>
          ) : outOfTime && state.phase === "idle" ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t.budgetUsed}</p>
          ) : !voiceAvailable ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t.voiceOff}</p>
          ) : state.textOnly && state.error ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t.micOff}</p>
          ) : null}

          <div className="rounded-2xl border border-line bg-surface shadow-card">
            <p className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">{t.transcript}</p>
            <div ref={transcriptRef} className="max-h-[320px] min-h-[140px] space-y-2.5 overflow-y-auto px-5 py-4" aria-live="polite">
              {state.transcript.length === 0 && !state.partial.agent ? (
                <p className="text-sm text-muted">{t.transcriptEmpty}</p>
              ) : (
                <>
                  {state.transcript.map((line) => (
                    <p key={line.id} className="text-[15px] leading-relaxed">
                      <span className={`me-2 text-xs font-semibold ${line.role === "user" ? "text-teal-700" : "text-brand"}`}>{line.role === "user" ? t.you : t.agent}</span>
                      <span className="text-ink">{line.text}</span>
                    </p>
                  ))}
                  {state.partial.agent ? (
                    <p className="text-[15px] leading-relaxed text-muted">
                      <span className="me-2 text-xs font-semibold text-brand">{t.agent}</span>
                      {state.partial.agent}
                    </p>
                  ) : null}
                </>
              )}
            </div>
            {live ? (
              <form onSubmit={submitTyped} className="flex gap-2 border-t border-line px-4 py-3">
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={t.typePlaceholder}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-base text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 md:text-sm"
                />
                <button type="submit" aria-label={t.send} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                  <Send size={16} aria-hidden />
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>

      {state.phase === "ended" && callRef ? <CallResult key={callRef} token={token} callRef={callRef} copy={copy} lang={lang} /> : null}
    </div>
  );
}

function SayList({ heading, lines, lang }: { heading?: string; lines: { text: string; gloss?: string }[]; lang: PortalLang }) {
  return (
    <>
    {heading ? <p className="mt-2 text-xs font-semibold text-ink">{heading}</p> : null}
    <ul className="mt-1.5 space-y-2">
      {lines.map((l) => (
        <li key={l.text} className="rounded-xl bg-canvas px-3 py-2">
          <p className="text-[15px] leading-snug text-ink" dir="auto">
            “{l.text}”
          </p>
          {lang === "en" && l.gloss ? <p className="mt-0.5 text-xs text-muted">{l.gloss}</p> : null}
        </li>
      ))}
    </ul>
    </>
  );
}

/** "Deutsch · Almanca": the speaker's own name, then the name in the portal's language when it differs. */
function languageText(l: VoiceOption, lang: PortalLang): string {
  const local = lang === "tr" ? (LANGUAGE_TR[l.name] ?? l.name) : l.name;
  return local === l.label ? l.label : `${l.label} · ${local}`;
}
