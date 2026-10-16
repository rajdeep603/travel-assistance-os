"use client";

import { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button, Card, ErrorBanner, SectionTitle, readApiError } from "@/components/ui";

// ---------------------------------------------------------------------------
// Integrity checks on a claim (fraud, waste and abuse): what was seen and
// why it matters. Internal only. The reviewer refers it to the fraud team or
// carries on; nothing is rejected automatically.
// ---------------------------------------------------------------------------

export interface Signal {
  code: string;
  reason: string;
}

export function IntegrityCard({
  claimId,
  signals,
  referred,
  onChanged,
}: {
  claimId: string;
  signals: Signal[] | null;
  referred: boolean;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (signals == null) return null;

  async function refer() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claimId}/refer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) {
        setError(await readApiError(res, "The referral could not be saved."));
        return;
      }
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Integrity checks</SectionTitle>
        <span className="text-[11px] text-muted">Internal: never shown to the claimant</span>
      </div>
      {signals.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted">
          <ShieldCheck size={16} aria-hidden className="text-brand" />
          No concerns: policy dates, identity, duplicates and totals all check out.
        </p>
      ) : (
        <>
          <ul className="mt-2 space-y-2">
            {signals.map((s) => (
              <li key={s.reason} className="flex items-start gap-2 text-sm text-ink">
                <ShieldAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-warn" />
                {s.reason}
              </li>
            ))}
          </ul>
          {error ? (
            <div className="mt-3">
              <ErrorBanner message={error} />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {referred ? (
              <p className="text-sm text-muted">Referred to the fraud team.</p>
            ) : (
              <Button variant="secondary" onClick={() => void refer()} busy={busy}>
                <ShieldAlert size={15} aria-hidden /> Refer to the fraud team
              </Button>
            )}
            <p className="text-xs text-muted">A signal is a reason to look, not a finding.</p>
          </div>
        </>
      )}
    </Card>
  );
}
