"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";

/**
 * Keeps a server-rendered page current during a demo: re-renders it when a
 * call starts or ends (the call monitor socket) and every `intervalMs` for
 * everything else (e-mails, faxes, letters).
 */
export function LiveRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
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
      .then((config: { monitorUrl?: string } | null) => {
        if (stopped || !config?.monitorUrl) return;
        socket = new WebSocket(config.monitorUrl);
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
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700" aria-live="off">
      <Radio size={13} aria-hidden /> Live{updatedAt ? ` · updated ${updatedAt}` : ""}
    </span>
  );
}
