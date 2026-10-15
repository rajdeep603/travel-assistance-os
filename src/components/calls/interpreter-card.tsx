"use client";

import { useEffect, useRef, useState } from "react";
import { Languages, PhoneOff } from "lucide-react";
import { Button, Card, ErrorBanner, SectionTitle } from "@/components/ui";
import { useInterpreterCall } from "@/lib/voice/client/use-interpreter-call";

const HOSPITAL_LANGUAGES = [
  ["tr", "Turkish"],
  ["ar", "Arabic"],
  ["de", "German"],
  ["fr", "French"],
  ["ru", "Russian"],
  ["es-ES", "Spanish"],
  ["it", "Italian"],
];

const STATUS_TEXT: Record<string, string> = {
  dialing: "Dialling the hospital…",
  ringing: "Ringing…",
  connecting: "Connecting the interpreter…",
  connected: "Live — speak English; the hospital hears it translated",
  no_answer: "The hospital didn't answer.",
  ended: "Call ended — the bilingual transcript is on the case.",
};

/**
 * Call a foreign hospital with a live AI interpreter: the case manager talks
 * in English in the browser, the hospital hears (and answers in) its own
 * language on the phone.
 */
export function InterpreterCard({ caseId }: { caseId: string }) {
  const { status, error, captions, languages, start, hangup } = useInterpreterCall();
  const [allowed, setAllowed] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [number, setNumber] = useState("");
  const [lang, setLang] = useState("tr");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/calls/outbound/options?caseId=${encodeURIComponent(caseId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((o) => {
        if (!o) return;
        setConfigured(o.telephonyConfigured);
        setAllowed(o.allowedNumbers);
        const hospital = o.agents.find((a: { id: string }) => a.id === "outbound-hospital-coordination");
        const s = hospital?.suggestedAllowed ? hospital.suggestedNumber : null;
        setSuggested(s);
        setNumber(s ?? o.allowedNumbers[0] ?? "");
      })
      .catch(() => undefined);
  }, [caseId]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [captions.length]);

  const active = ["dialing", "ringing", "connecting", "connected"].includes(status);
  if (!configured) return null;

  return (
    <Card>
      <SectionTitle>Live interpreter call</SectionTitle>
      {!active ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-500">Call the hospital and talk in English — an AI interprets both ways in real time.</p>
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Hospital number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
            >
              {allowed.map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === suggested ? " (hospital)" : ""}
                </option>
              ))}
            </select>
            <select
              aria-label="Hospital language"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
            >
              {HOSPITAL_LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => void start({ caseId, hospitalNumber: number, hospitalLanguage: lang })} disabled={!number} className="w-full">
            <Languages size={15} aria-hidden /> Start interpreted call
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">{languages.join(" ⇄ ")}</p>
          <Button variant="danger" onClick={hangup}>
            <PhoneOff size={15} aria-hidden /> Hang up
          </Button>
        </div>
      )}
      {STATUS_TEXT[status] ? <p className="mt-2 text-xs text-slate-500" aria-live="polite">{STATUS_TEXT[status]}</p> : null}
      {error ? (
        <div className="mt-2">
          <ErrorBanner message={error} />
        </div>
      ) : null}
      {captions.length ? (
        <div ref={box} role="log" aria-label="Interpreted captions" className="mt-3 max-h-64 space-y-1.5 overflow-y-auto text-xs">
          {captions.map((c) => (
            <p
              key={c.id}
              className={`rounded-md px-2 py-1 ${
                c.side === "manager" ? "bg-blue-50 text-blue-900" : "bg-slate-100 text-slate-800"
              } ${c.kind === "translation" ? "ml-4 italic opacity-80" : ""}`}
            >
              <span className="font-semibold">{c.side === "manager" ? "You" : "Hospital"}{c.kind === "translation" ? " (translated)" : ""}: </span>
              {c.text}
            </p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
