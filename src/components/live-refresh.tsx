"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a server-rendered page current during a demo: re-renders it when a
 * call starts or ends (the call monitor socket) and every `intervalMs` for
 * everything else (e-mails, faxes, letters).
 */
export function LiveRefresh({ intervalMs = 30_000, tone = "light" }: { intervalMs?: number; tone?: "light" | "stage" }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let stopped = false;
    const stamp = () =>
      setUpdatedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    const refresh = () => {
      router.refresh();
      stamp();
    };
    stamp();
    const timer = window.setInterval(refresh, intervalMs);
    fetch("/api/calls/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((config: { monitorUrl?: string; voiceConfigured?: boolean; telephonyConfigured?: boolean } | null) => {
        // Calls exist only where voice or telephony is set up; elsewhere there's no gateway to listen to.
        if (stopped || !config?.monitorUrl || !(config.voiceConfigured || config.telephonyConfigured)) return;
        socket = new WebSocket(config.monitorUrl);
        socket.onerror = () => undefined; // the 30-second refresh still runs
        socket.onmessage = (m) => {
          try {
            const event = JSON.parse(m.data as string) as { type?: string };
            if (event.type === "call_started" || event.type === "call_ended") refresh();
          } catch {
            // not an event
          }
        };
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      socket?.close();
    };
  }, [router, intervalMs]);

  return (
    <span className={`inline-flex items-center gap-2 text-xs font-medium tabular-nums ${tone === "stage" ? "text-live" : "text-emerald-700"}`} aria-live="off">
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className={`animate-live-ping absolute inset-0 rounded-full ${tone === "stage" ? "bg-live" : "bg-emerald-500"}`} />
        <span className={`relative h-2 w-2 rounded-full ${tone === "stage" ? "bg-live" : "bg-emerald-500"}`} />
      </span>
      Live{updatedAt ? ` · updated ${updatedAt}` : ""}
    </span>
  );
}
