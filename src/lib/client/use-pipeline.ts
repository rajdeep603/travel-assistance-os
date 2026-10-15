"use client";

import { useEffect, useReducer, useRef } from "react";
import { useReducedMotion } from "motion/react";

// ---------------------------------------------------------------------------
// Timing for the staged AI-pipeline progress (components/ai-progress.tsx).
// While the request runs, the stages walk forward and hold on the last one.
// When the real answer arrives, the remaining stages complete quickly and
// only then do the results appear, so the animation always ends with the
// response, never before or long after it.
// ---------------------------------------------------------------------------

/** Pace of each remaining stage once the answer has arrived. */
export const FINISH_STEP_MS = 90;
/** How long the completed trail stays before the results replace it. */
export const SETTLE_MS = 280;

export interface PipelineState {
  active: number;
  mode: "idle" | "running" | "finishing";
}

export type PipelineAction =
  | { type: "start" }
  | { type: "tick"; count: number }
  | { type: "finish"; skip?: boolean }
  | { type: "settled" };

const IDLE: PipelineState = { active: 0, mode: "idle" };

/** Exported for tests. */
export function pipelineReducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case "start":
      return { active: 0, mode: "running" };
    case "tick": {
      // Running holds on the last stage; finishing walks past it to "all done".
      const cap = state.mode === "running" ? action.count - 1 : state.mode === "finishing" ? action.count : state.active;
      const active = Math.min(state.active + 1, cap);
      return active === state.active ? state : { ...state, active };
    }
    case "finish":
      if (state.mode !== "running") return state;
      return action.skip ? IDLE : { ...state, mode: "finishing" };
    case "settled":
      return IDLE;
  }
}

/**
 * Drives an AIPipeline from a request's busy flag. `visible` stays true for
 * the short finish after `busy` ends; render results only when it is false.
 * A failed request (or reduced motion) skips the finish.
 */
export function usePipeline(busy: boolean, count: number, { stepMs = 650, failed = false } = {}) {
  const [state, dispatch] = useReducer(pipelineReducer, IDLE);
  const reduceMotion = useReducedMotion();
  const skipRef = useRef(false);
  skipRef.current = failed || !!reduceMotion;

  useEffect(() => {
    dispatch(busy ? { type: "start" } : { type: "finish", skip: skipRef.current });
  }, [busy]);

  useEffect(() => {
    if (state.mode === "idle") return;
    if (state.mode === "finishing" && state.active >= count) {
      const timer = window.setTimeout(() => dispatch({ type: "settled" }), SETTLE_MS);
      return () => window.clearTimeout(timer);
    }
    if (state.mode === "running" && state.active >= count - 1) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "tick", count }),
      state.mode === "running" ? stepMs : FINISH_STEP_MS
    );
    return () => window.clearTimeout(timer);
  }, [state, count, stepMs]);

  return { visible: busy || state.mode !== "idle", active: state.active };
}
