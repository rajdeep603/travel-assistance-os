"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Reveals a finished answer word by word, so it reads as being written
 * rather than appearing in one block. Capped at `maxMs` however long the
 * text is; instant when inactive or when the viewer prefers reduced motion.
 */
export function useWordReveal(text: string, active: boolean, { maxMs = 1200, stepMs = 28 } = {}) {
  const reduceMotion = useReducedMotion();
  const animate = active && !reduceMotion;
  const tokens = text.split(/(\s+)/);
  const [count, setCount] = useState(animate ? 0 : tokens.length);

  useEffect(() => {
    if (!animate) {
      setCount(tokens.length);
      return;
    }
    const total = Math.min(maxMs, Math.ceil(tokens.length / 2) * stepMs);
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const n = Math.ceil(Math.min(1, (now - t0) / total) * tokens.length);
      setCount((c) => (c === n ? c : n));
      if (n < tokens.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, animate]); // eslint-disable-line react-hooks/exhaustive-deps

  return { shown: count >= tokens.length ? text : tokens.slice(0, count).join(""), done: count >= tokens.length };
}
