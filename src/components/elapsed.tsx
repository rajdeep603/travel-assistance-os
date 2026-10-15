"use client";

import { useEffect, useState } from "react";

/** A ticking m:ss timer since `since` (ISO string or epoch ms). */
export function Elapsed({ since, className = "" }: { since: string | number; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return (
    <span className={`tabular-nums ${className}`}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}
