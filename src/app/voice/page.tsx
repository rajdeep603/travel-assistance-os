"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CalendarCheck2,
  FolderKanban,
  Mic,
  MicOff,
  PhoneCall,
  SendHorizonal,
  User,
  Volume2,
} from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  KeyValue,
  PageHeader,
  SectionTitle,
  StatusBadge,
} from "@/components/ui";

type VoiceStatus = "idle" | "listening" | "processing" | "speaking";

// Minimal Web Speech API typings (not part of the standard TS lib).
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}
interface SpeechRecognitionEventLike {
  results: { 0: { 0: { transcript: string } } };
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

interface TranscriptEntry {
  role: "user" | "agent";
  text: string;
}

interface Option {
  providerId: string;
  name: string;
  facility: string;
  specialty: string;
  district: string;
  distanceKm: number | null;
  languages: string[];
  phone: string;
  slot: { date: string; time: string } | null;
}

interface VoiceState {
  step: string;
  info: {
    name: string | null;
    location: string | null;
    problem: string | null;
    specialty: string | null;
    preferredDate: string | null;
    preferredTime: string | null;
    language: string | null;
    contact: string | null;
  };
}

interface AppointmentInfo {
  ref: string;
  status: string;
  scheduledAt: string;
  providerName: string;
}

interface CaseInfo {
  ref: string;
  status: string;
  title: string;
}

const STATUS_LABELS: Record<VoiceStatus, string> = {
  idle: "Idle",
  listening: "Listening…",
  processing: "Processing…",
  speaking: "Speaking…",
};

const STATUS_COLORS: Record<VoiceStatus, string> = {
  idle: "bg-slate-300",
  listening: "bg-emerald-500 animate-pulse",
  processing: "bg-amber-500 animate-pulse",
  speaking: "bg-blue-500 animate-pulse",
};

export default function VoicePage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [state, setState] = useState<VoiceState | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [appointment, setAppointment] = useState<AppointmentInfo | null>(null);
  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [done, setDone] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceEnabledRef = useRef(voiceEnabled);
  const doneRef = useRef(done);
  const conversationRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  voiceEnabledRef.current = voiceEnabled;
  doneRef.current = done;
  conversationRef.current = conversationId;

  useEffect(() => {
    const w = window as unknown as SpeechWindow;
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) {
      setVoiceSupported(false);
      setVoiceEnabled(false);
    }
    return () => {
      try {
        recognitionRef.current?.abort?.();
        window.speechSynthesis?.cancel();
      } catch {
        // cleanup only
      }
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, status]);

  const speak = useCallback((text: string, onDone: () => void) => {
    if (!voiceEnabledRef.current || !window.speechSynthesis) {
      onDone();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.02;
      utterance.onend = onDone;
      utterance.onerror = () => onDone();
      setStatus("speaking");
      window.speechSynthesis.speak(utterance);
    } catch {
      onDone();
    }
  }, []);

  const startListening = useCallback(() => {
    if (!voiceEnabledRef.current || doneRef.current) {
      setStatus("idle");
      return;
    }
    const w = window as unknown as SpeechWindow;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setStatus("idle");
      return;
    }
    try {
      const rec = new SR();
      recognitionRef.current = rec;
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        void sendUtterance(ev.results[0][0].transcript);
      };
      rec.onerror = (ev) => {
        setStatus("idle");
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          setError(
            "Microphone access was blocked. You can keep using the conversation by typing below."
          );
          setVoiceEnabled(false);
        }
      };
      rec.onend = () => {
        setStatus((s) => (s === "listening" ? "idle" : s));
      };
      setStatus("listening");
      rec.start();
    } catch {
      setStatus("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  interface TurnPayload {
    reply: string;
    state: VoiceState | null;
    options?: Option[];
    appointment?: { ref: string; status: string; scheduledAt: string; providerName: string } | null;
    case?: CaseInfo | null;
    done?: boolean;
  }

  const applyTurn = useCallback(
    (turn: TurnPayload) => {
      setState(turn.state ?? null);
      setOptions(turn.options ?? []);
      if (turn.appointment) {
        setAppointment({
          ref: turn.appointment.ref,
          status: turn.appointment.status,
          scheduledAt: turn.appointment.scheduledAt,
          providerName: turn.appointment.providerName,
        });
      }
      if (turn.case) setCaseInfo(turn.case);
      if (turn.done) setDone(true);
      setTranscript((t) => [...t, { role: "agent", text: turn.reply }]);
      speak(turn.reply, () => {
        if (turn.done || turn.state?.step === "HANDOFF") setStatus("idle");
        else startListening();
      });
    },
    [speak, startListening]
  );

  async function startCall() {
    setError(null);
    setTranscript([]);
    setAppointment(null);
    setCaseInfo(null);
    setOptions([]);
    setDone(false);
    setStatus("processing");
    try {
      const res = await fetch("/api/voice/start", { method: "POST" });
      if (!res.ok) {
        setStatus("idle");
        setError("The voice agent could not be started — please try again.");
        return;
      }
      const turn = await res.json();
      setConversationId(turn.conversationId);
      conversationRef.current = turn.conversationId;
      applyTurn(turn);
    } catch {
      setStatus("idle");
      setError("The voice agent is unreachable — please check your connection.");
    }
  }

  async function sendUtterance(text: string) {
    const utterance = text.trim();
    const convId = conversationRef.current;
    if (!utterance || !convId) return;
    try {
      recognitionRef.current?.abort?.();
    } catch {
      // ignore
    }
    setTranscript((t) => [...t, { role: "user", text: utterance }]);
    setStatus("processing");
    setError(null);
    try {
      const res = await fetch("/api/voice/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, utterance }),
      });
      if (!res.ok) {
        setStatus("idle");
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "The agent could not process that — try again.");
        return;
      }
      applyTurn(await res.json());
    } catch {
      setStatus("idle");
      setError("The agent is unreachable — please check your connection.");
    }
  }

  const info = state?.info;
  const selectedInfoRows = info
    ? ([
        ["Patient name", info.name],
        ["Location", info.location],
        ["Medical problem", info.problem],
        ["Specialty", info.specialty],
        ["Preferred date", info.preferredDate],
        ["Preferred time", info.preferredTime],
        ["Language", info.language],
        ["Contact", info.contact],
      ] as const)
    : [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="AI Voice Medical Assistance Agent"
        subtitle="A browser-based voice agent that finds a doctor and books a real appointment — then hands the case to a human case manager."
      />
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}
      {!voiceSupported ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          This browser does not support speech recognition — the agent works in
          text mode below. For the full voice demo use Chrome or Edge.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${STATUS_COLORS[status]}`} />
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Voice status: {STATUS_LABELS[status]}
                  </p>
                  <p className="text-xs text-slate-400">
                    {conversationId
                      ? done
                        ? "Workflow complete — case handed to a human case manager."
                        : "Call in progress"
                      : "No active call"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {voiceSupported ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setVoiceEnabled((v) => {
                        const next = !v;
                        if (!next) {
                          try {
                            recognitionRef.current?.abort?.();
                            window.speechSynthesis?.cancel();
                          } catch {
                            // ignore
                          }
                          setStatus("idle");
                        }
                        return next;
                      });
                    }}
                  >
                    {voiceEnabled ? <Volume2 size={15} /> : <MicOff size={15} />}
                    {voiceEnabled ? "Voice on" : "Voice off"}
                  </Button>
                ) : null}
                <Button onClick={startCall} disabled={status === "processing"}>
                  <PhoneCall size={15} />
                  {conversationId ? "Restart call" : "Start call"}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="flex h-[430px] flex-col">
            <SectionTitle>Live transcript</SectionTitle>
            <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
              {transcript.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    title="Start the call to begin"
                    hint='Try: "I’m travelling in Istanbul and I need to see a doctor tomorrow."'
                  />
                </div>
              ) : (
                transcript.map((t, i) => (
                  <div
                    key={i}
                    className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`flex max-w-[85%] items-start gap-2 rounded-2xl px-4 py-2.5 text-sm ${
                        t.role === "user"
                          ? "rounded-br-sm bg-blue-600 text-white"
                          : "rounded-bl-sm bg-slate-100 text-slate-800"
                      }`}
                    >
                      {t.role === "agent" ? (
                        <Bot size={15} className="mt-0.5 shrink-0 text-blue-500" />
                      ) : (
                        <User size={15} className="mt-0.5 shrink-0 text-blue-200" />
                      )}
                      <span className="leading-relaxed">{t.text}</span>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
            <form
              className="mt-3 flex gap-2 border-t border-slate-100 pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (textInput.trim()) {
                  void sendUtterance(textInput);
                  setTextInput("");
                }
              }}
            >
              {voiceSupported && voiceEnabled ? (
                <Button
                  variant="secondary"
                  onClick={startListening}
                  disabled={!conversationId || status !== "idle" || done}
                >
                  <Mic size={15} />
                  Speak
                </Button>
              ) : null}
              <input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={
                  conversationId ? "…or type your answer" : "Start the call first"
                }
                disabled={!conversationId || done}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
              />
              <Button
                type="submit"
                disabled={!conversationId || textInput.trim().length === 0 || done}
              >
                <SendHorizonal size={15} />
              </Button>
            </form>
          </Card>

          {done ? (
            <div className="flex items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
              <span className="text-sm font-semibold text-emerald-700">AI Completed</span>
              <ArrowRight size={16} className="text-emerald-500" />
              <span className="text-sm font-semibold text-emerald-700">
                Human Case Manager
              </span>
              <span className="text-xs text-emerald-600">
                — the case manager sees the full summary
                {caseInfo ? (
                  <>
                    {" "}
                    in{" "}
                    <a href={`/cases/${caseInfo.ref}`} className="font-semibold underline">
                      {caseInfo.ref}
                    </a>
                  </>
                ) : null}
                .
              </span>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <SectionTitle>Patient information</SectionTitle>
            {info && selectedInfoRows.some(([, v]) => v) ? (
              <dl className="mt-1">
                {selectedInfoRows
                  .filter(([, v]) => v)
                  .map(([label, value]) => (
                    <KeyValue key={label} label={label} value={value} />
                  ))}
              </dl>
            ) : (
              <p className="mt-2 text-xs text-slate-400">
                Collected details appear here as the agent asks its questions.
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle>Provider</SectionTitle>
            {options.length > 0 ? (
              <div className="mt-2 space-y-2">
                {options.map((o, i) => (
                  <button
                    key={o.providerId}
                    type="button"
                    onClick={() => sendUtterance(`Option ${i + 1}`)}
                    disabled={done || status === "processing"}
                    className="w-full rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-blue-400 disabled:opacity-60"
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {i + 1}. {o.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {o.specialty} · {o.facility}, {o.district}
                      {o.distanceKm != null ? ` (${o.distanceKm} km)` : ""}
                    </p>
                    {o.slot ? (
                      <p className="mt-1 text-xs font-semibold text-blue-600">
                        {o.slot.date} at {o.slot.time}
                      </p>
                    ) : null}
                  </button>
                ))}
                <p className="text-[11px] text-slate-400">
                  Say “option one” — or click an option.
                </p>
              </div>
            ) : appointment ? (
              <p className="mt-2 text-sm text-slate-700">{appointment.providerName}</p>
            ) : (
              <p className="mt-2 text-xs text-slate-400">
                Matching providers appear here after the agent searches.
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle>Appointment</SectionTitle>
            {appointment ? (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <CalendarCheck2 size={16} className="text-emerald-500" />
                  <span className="text-sm font-semibold text-slate-800">
                    {appointment.ref}
                  </span>
                  <StatusBadge value={appointment.status} />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  {appointment.providerName} ·{" "}
                  {new Date(appointment.scheduledAt).toLocaleString("en-GB", {
                    dateStyle: "full",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">
                The confirmed appointment appears here after booking.
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle>Case</SectionTitle>
            {caseInfo ? (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <FolderKanban size={16} className="text-blue-500" />
                  <a
                    href={`/cases/${caseInfo.ref}`}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    {caseInfo.ref}
                  </a>
                  <StatusBadge value={caseInfo.status} />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">{caseInfo.title}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">
                The assistance case appears here once created.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
