"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts a stat-tile number up from zero on mount — a small demo moment.
 * Skipped (renders the final value) when the viewer prefers reduced motion.
 */
export function CountUp({ value, durationMs = 800 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(value === 0 ? 0 : null as number | null);
  const frame = useRef<number>();

  useEffect(() => {
    if (value === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(eased * value));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs]);

  // Before hydration (and on the server) show the real value — no flash of 0.
  return <>{display ?? value}</>;
}
