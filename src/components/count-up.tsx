"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

/**
 * Counts a stat-tile number up from zero on mount — a small demo moment.
 * Skipped (renders the final value) when the viewer prefers reduced motion.
 */
export function CountUp({
  value,
  durationMs = 800,
  format,
  currency,
}: {
  value: number;
  durationMs?: number;
  /** Formats the number on every frame, e.g. as currency. */
  format?: (n: number) => string;
  /** Shorthand for whole-unit currency formatting; usable from server components. */
  currency?: string;
}) {
  const [display, setDisplay] = useState(value === 0 ? 0 : null as number | null);
  const frame = useRef<number>();
  // Where the next animation starts: zero on mount, the previous value after a live refresh.
  const from = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (value === start || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      setDisplay(value);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      // Whole numbers while counting; the exact value (cents included) at the end.
      const current = t >= 1 ? value : Math.round(start + eased * (value - start));
      from.current = current;
      setDisplay(current);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs]);

  // Before hydration (and on the server) show the real value — no flash of 0.
  const shown = display ?? value;
  const fmt = format ?? (currency ? (n: number) => formatMoney(n, currency) : null);
  return <>{fmt ? fmt(shown) : shown}</>;
}
