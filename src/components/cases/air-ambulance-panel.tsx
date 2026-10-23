"use client";

import { useState } from "react";
import { AlertTriangle, BadgeCheck, CheckCircle2, Circle, PlaneTakeoff, Inbox } from "lucide-react";
import { Button, ErrorBanner, readApiError } from "@/components/ui";
import { formatDayTime, formatMoney } from "@/lib/format";
import { useT } from "@/components/i18n";

export interface AirQuote {
  id: string;
  operator: string;
  accreditations: string[];
  aircraft: string;
  crew: string;
  price: number;
  currency: string;
  wheelsUpHours: number;
  bedToBed: boolean;
  concerns: string[];
}

export interface Mission {
  quoteId: string;
  operator: string;
  price: number;
  currency: string;
  steps: { code: string; label: string; at: string | null }[];
}

/** The cheapest quote with no concerns (the same rule as the server's). */
const best = (quotes: AirQuote[]) => [...quotes].filter((q) => q.concerns.length === 0).sort((a, b) => a.price - b.price || a.wheelsUpHours - b.wheelsUpHours)[0] ?? null;

/**
 * Air ambulance quotes side by side (accreditation, crew, bed to bed, wheels
 * up), the booking, and the mission's steps as the operator reports them.
 */
export function AirAmbulancePanel({ planRef, quotes, mission, onChanged }: { planRef: string; quotes: AirQuote[] | null; mission: Mission | null; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const t = useT();

  async function act(action: "quotes" | "book" | "advance", body?: unknown) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/transport/${planRef}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(await readApiError(res, "That didn't work."));
      setPicked(null);
      setReason("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  if (mission) {
    const done = mission.steps.filter((s) => s.at).length;
    return (
      <div className="mt-4 rounded-xl border border-line/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">
            Mission: {mission.operator} · <span className="tabular-nums">{formatMoney(mission.price, mission.currency)}</span>
          </p>
          <span className="text-xs tabular-nums text-muted">
            {done} of {mission.steps.length} steps
          </span>
        </div>
        <ol className="mt-3 space-y-2">
          {mission.steps.map((s) => (
            <li key={s.code} className="flex items-start gap-2 text-sm">
              {s.at ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden /> : <Circle size={16} className="mt-0.5 shrink-0 text-line" aria-hidden />}
              <span className={s.at ? "text-ink" : "text-muted"}>
                {s.label}
                {s.at ? <span className="ml-2 text-xs text-muted">{formatDayTime(s.at)}</span> : null}
              </span>
            </li>
          ))}
        </ol>
        {error ? <div className="mt-3"><ErrorBanner message={error} /></div> : null}
        {done < mission.steps.length ? (
          <div className="mt-3">
            <Button variant="secondary" onClick={() => act("advance")} busy={busy === "advance"}>
              <PlaneTakeoff size={15} aria-hidden /> Operator reports: {mission.steps[done].label.toLowerCase()}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (!quotes?.length) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-line p-4">
        <p className="text-sm text-muted">Quote requests went to the network&apos;s air ambulance operators. Their replies are compared on accreditation, crew, bed to bed and wheels-up time, not price alone.</p>
        {error ? <div className="mt-3"><ErrorBanner message={error} /></div> : null}
        <div className="mt-3">
          <Button variant="secondary" onClick={() => act("quotes")} busy={busy === "quotes"}>
            <Inbox size={15} aria-hidden /> {t("Receive the operators' quotes (demo)")}
          </Button>
        </div>
      </div>
    );
  }

  const recommended = best(quotes);
  const pickedQuote = quotes.find((q) => q.id === picked) ?? null;
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-ink">{t("Operators' quotes")}</p>
      <ul className="mt-2 space-y-2">
        {[...quotes].sort((a, b) => a.price - b.price).map((q) => {
          const isBest = recommended?.id === q.id;
          return (
            <li key={q.id} className={`rounded-xl border px-4 py-3 ${isBest ? "border-brand/50 bg-brand/[0.04]" : "border-line/70"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {q.operator}
                    {isBest ? <span className="ms-2 text-xs font-semibold text-brand">{t("Best value")}</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {q.aircraft} · {q.crew} · wheels up within {q.wheelsUpHours} h{q.bedToBed ? " · bed to bed" : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {q.accreditations.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 rounded-full border border-brand/20 bg-brand/[0.06] px-2 py-0.5 text-[11px] font-medium text-brand">
                        <BadgeCheck size={12} aria-hidden /> {a}
                      </span>
                    ))}
                  </div>
                  {q.concerns.length ? (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-warn">
                      {q.concerns.map((c) => (
                        <li key={c} className="flex items-center gap-1">
                          <AlertTriangle size={12} aria-hidden /> {c}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold tabular-nums text-ink">{formatMoney(q.price, q.currency)}</p>
                  <Button variant={isBest ? "primary" : "secondary"} className="mt-1.5" onClick={() => (q.concerns.length ? setPicked(q.id) : act("book", { quoteId: q.id }))} busy={busy === "book" && (picked === q.id || (!picked && isBest))}>
                    {t("Book")}
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {pickedQuote ? (
        <div className="mt-3 rounded-lg border border-warn/30 bg-warn/[0.07] p-3">
          <p className="text-sm text-ink/90">
            {pickedQuote.operator} has concerns ({pickedQuote.concerns.join("; ").toLowerCase()}). Say why it should be booked anyway:
          </p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-2 w-full rounded-lg border border-line bg-surface p-2 text-sm" />
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => act("book", { quoteId: pickedQuote.id, reason })} busy={busy === "book"} disabled={reason.trim().length < 5}>
              Book with this reason
            </Button>
            <Button variant="secondary" onClick={() => setPicked(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <div className="mt-3"><ErrorBanner message={error} /></div> : null}
    </div>
  );
}
