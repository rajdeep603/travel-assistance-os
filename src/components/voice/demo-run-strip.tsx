"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ListChecks, RefreshCw } from "lucide-react";
import { Button, Card, readApiError } from "@/components/ui";
import type { AgentFit } from "@/lib/voice/agents/types";
import { HOTLINE_SCRIPTS } from "@/lib/voice/call-scripts";
import type { DemoCue, DemoStep, DemoTrack } from "@/lib/voice/demo-runs";

// ---------------------------------------------------------------------------
// The 15-minute demo run above the voice stage: pick who you're meeting, and
// the steps appear in order, each on the case that fits its agent, with a dot
// saying whether that case is ready. A step loads its agent, case and
// language into the picker and shows the lines to say as the other side,
// with the call-my-phone controls under them. Nothing here is a note to the
// presenter: the prospect watches this screen.
// ---------------------------------------------------------------------------

export interface ResolvedStep extends DemoStep {
  trackId: string;
  agentLabel: string;
  case: { id: string; ref: string } | null;
  /** Null for steps that need no case (hotline, booking): always ready. */
  fit: AgentFit | null;
}

export interface ResolvedTrack extends Omit<DemoTrack, "steps"> {
  steps: ResolvedStep[];
}

const isReady = (s: ResolvedStep) => !s.fit || s.fit.ready;

export function DemoRunStrip({
  initialTrackId,
  initialStepId,
  onStep,
  onTrack,
  onPrepared,
  disabled,
  callPanel,
}: {
  initialTrackId: string | null;
  initialStepId: string | null;
  /** A step was chosen: load its agent, case and language. */
  onStep: (step: ResolvedStep) => void;
  /** The run changed (or was closed), for the address bar. */
  onTrack: (id: string | null) => void;
  /** Demo cases were repaired: reload the agent catalogue. */
  onPrepared: () => void;
  disabled: boolean;
  /** The step's call-my-phone controls, shown under its cue card. */
  callPanel?: ReactNode;
}) {
  const [tracks, setTracks] = useState<ResolvedTrack[] | null>(null);
  const [trackId, setTrackId] = useState<string | null>(initialTrackId);
  const [stepId, setStepId] = useState<string | null>(initialStepId);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedFromLink = useRef(false);

  const load = useCallback(
    () =>
      fetch("/api/voice/demo-runs")
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => body && setTracks(body.tracks))
        .catch(() => undefined),
    []
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (initialTrackId) setTrackId(initialTrackId);
  }, [initialTrackId]);
  useEffect(() => {
    if (initialStepId) setStepId(initialStepId);
  }, [initialStepId]);
  // A link with ?run=&step= opens that step once the runs are known.
  useEffect(() => {
    if (openedFromLink.current || !tracks || !initialTrackId || !initialStepId) return;
    const step = tracks.find((t) => t.id === initialTrackId)?.steps.find((s) => s.id === initialStepId);
    if (step) {
      openedFromLink.current = true;
      onStep(step);
    }
  }, [tracks, initialTrackId, initialStepId, onStep]);

  const track = tracks?.find((t) => t.id === trackId) ?? null;
  const step = track?.steps.find((s) => s.id === stepId) ?? null;
  const notReady = track?.steps.filter((s) => !isReady(s)) ?? [];

  function pickTrack(id: string | null) {
    setTrackId(id);
    setStepId(null);
    setError(null);
    onTrack(id);
  }

  function pickStep(s: ResolvedStep) {
    setStepId(s.id);
    onStep(s);
  }

  async function prepareAll() {
    if (!track) return;
    setPreparing(true);
    setError(null);
    try {
      const res = await fetch("/api/voice/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: track.id }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The demo cases couldn't be prepared."));
        return;
      }
      await load();
      onPrepared();
    } finally {
      setPreparing(false);
    }
  }

  if (!tracks) return null;

  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="me-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <ListChecks size={16} className="text-brand" aria-hidden />
          15-minute demo run
        </span>
        {tracks.map((t) => {
          const selected = t.id === trackId;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => pickTrack(selected ? null : t.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 disabled:opacity-60 ${
                selected ? "bg-brand bg-brand-gradient text-white shadow-glow" : "border border-line bg-surface text-ink hover:border-brand/40"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {track ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">{track.audience}</p>
          <ol className="flex flex-wrap gap-2">
            {track.steps.map((s, i) => {
              const selected = s.id === stepId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => pickStep(s)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-start text-sm transition-colors duration-150 disabled:opacity-60 ${
                      selected ? "border-brand bg-brand/10" : "border-line bg-surface hover:border-brand/40"
                    }`}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-canvas text-xs font-semibold tabular-nums text-ink">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{s.title}</span>
                      <span className="block text-xs text-muted">
                        {s.agentLabel}
                        {s.case ? ` · ${s.case.ref}` : s.record ? ` · ${s.record}` : ""}
                        {` · ${s.minutes} min`}
                      </span>
                    </span>
                    <span
                      className={`ms-1 h-2.5 w-2.5 shrink-0 rounded-full ${isReady(s) ? "bg-brand" : "bg-warn"}`}
                      role="img"
                      aria-label={isReady(s) ? "Ready" : `Not ready: ${s.fit?.why ?? ""}`}
                      title={isReady(s) ? "Ready" : s.fit?.why}
                    />
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            {notReady.length ? (
              <>
                <span className="text-ink">
                  <span className="font-semibold">{notReady.length === 1 ? "One step isn't ready" : `${notReady.length} steps aren't ready`}:</span>{" "}
                  {notReady.map((s) => `${s.title} (${s.fit?.why ?? ""})`).join("; ")}
                </span>
                <Button variant="secondary" busy={preparing} disabled={disabled} onClick={() => void prepareAll()}>
                  <RefreshCw size={14} aria-hidden /> Make all ready
                </Button>
              </>
            ) : (
              <span className="flex items-center gap-1.5">
                <Check size={14} className="text-brand" aria-hidden /> Every step is ready.
              </span>
            )}
          </div>
          {error ? <p className="text-xs text-red-700">{error}</p> : null}

          {step ? <CueCard step={step} /> : null}
          {step ? callPanel : null}
        </div>
      ) : null}
    </Card>
  );
}

/** The lines to say as the other side, and what the agent should do back. */
function CueCard({ step }: { step: ResolvedStep }) {
  const script = step.scriptId ? HOTLINE_SCRIPTS.find((s) => s.id === step.scriptId) : null;
  const cues: DemoCue[] = step.cues ?? script?.turns ?? [];
  return (
    <div className="rounded-xl border border-line bg-canvas/60 p-3 text-sm" data-testid="cue-card">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span>
          <span className="font-semibold text-ink">You play:</span> {step.youPlay}
        </span>
        {step.language ? (
          <span>
            <span className="font-semibold text-ink">Language:</span> {step.language}
          </span>
        ) : null}
        {step.fit?.record ? (
          <span>
            <span className="font-semibold text-ink">About:</span> {step.fit.record}
          </span>
        ) : null}
      </div>
      {cues.length ? (
        <ol className="mt-2 space-y-2">
          {cues.map((c, i) => (
            <li key={i} className="grid gap-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
              <p className="text-ink">
                <span className="me-1 text-xs font-semibold text-muted">Say</span>“{c.say}”
              </p>
              <p className="text-muted">
                <span className="me-1 text-xs font-semibold">Hear</span>
                {c.hear}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
      {script?.note ? <p className="mt-2 text-xs text-muted">{script.note}</p> : null}
    </div>
  );
}
