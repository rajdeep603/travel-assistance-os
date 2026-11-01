"use client";

import { useEffect, useState } from "react";
import { PhoneIncoming } from "lucide-react";
import { Button, readApiError } from "@/components/ui";

/**
 * "Ring my phone": the hotline calls an approved number, and the hotline agent
 * greets when it's answered. For a booth whose SIMs can't dial the hotline
 * (a toll-free number from abroad, roaming that blocks international calls).
 */
export function RingMe() {
  const [options, setOptions] = useState<{ telephonyConfigured: boolean; allowedNumbers: string[] } | null>(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calls/outbound/options")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!body) return;
        setOptions(body);
        setTo(body.allowedNumbers?.[0] ?? "");
      })
      .catch(() => undefined);
  }, []);

  async function ring() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/calls/ring-me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) });
      if (!res.ok) {
        setError(await readApiError(res, "The call could not be placed."));
        return;
      }
      setDone((await res.json()).to);
    } finally {
      setBusy(false);
    }
  }

  if (!options?.telephonyConfigured || !options.allowedNumbers.length) return null;

  return (
    <div className="mt-3 rounded-xl border border-line bg-canvas/60 p-3 text-xs text-muted">
      <p>
        <span className="font-semibold text-ink">Can&apos;t dial the number from here?</span> Let the hotline ring you: answer, and the agent greets you as on a dialled-in call.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="Phone to ring"
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
        >
          {options.allowedNumbers.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Button variant="secondary" busy={busy} disabled={!to} onClick={() => void ring()}>
          <PhoneIncoming size={14} aria-hidden /> Ring my phone
        </Button>
        {done ? <span className="text-ink">Ringing {done}: pick up.</span> : null}
        {error ? <span className="text-red-700">{error}</span> : null}
      </div>
    </div>
  );
}
