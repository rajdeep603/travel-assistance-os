"use client";

import { useState } from "react";
import { Check, ReceiptText } from "lucide-react";
import { Button, Card, ErrorBanner, SectionTitle, readApiError } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { formatActor, formatDateTime, formatMoneyExact } from "@/lib/format";

// ---------------------------------------------------------------------------
// The bill review of one invoice or cost estimate: billed vs recommended, the
// lines with what changed and why, and the person's decision. The rules (not
// the model) recommend; nothing changes until someone accepts.
// ---------------------------------------------------------------------------

interface Finding {
  line: number | null;
  rule: string;
  reason: string;
  saving: number;
}

interface Line {
  code: string | null;
  description: string;
  quantity: number | null;
  billed: number;
  recommended: number;
  covered: boolean;
}

export interface BillReview {
  id: string;
  kind: "HOSPITAL_INVOICE" | "COST_ESTIMATE";
  currency: string;
  billed: number;
  recommended: number;
  savings: number;
  status: "PROPOSED" | "ACCEPTED" | "WAIVED";
  decidedBy: string | null;
  decidedAt: string | null;
  ruleset: string;
  result: {
    lines: Line[];
    findings: Finding[];
    notCovered: number;
    guarantee: { ref: string; amount: number; currency: string; exceedsBy: number; recommendedExceedsBy: number } | null;
  };
}

const STATUS: Record<BillReview["status"], { label: string; className: string }> = {
  PROPOSED: { label: "Awaiting a decision", className: "border-warn/40 bg-warn/10 text-ink" },
  ACCEPTED: { label: "Accepted", className: "border-brand/30 bg-brand/10 text-brand-deep" },
  WAIVED: { label: "Paid as billed", className: "border-line bg-canvas text-muted" },
};

export function BillReviewCard({
  review,
  title,
  onChanged,
  bare = false,
}: {
  review: BillReview;
  /** The document's number or name. */
  title?: string;
  onChanged?: (review: BillReview) => void;
  /** Without its own card frame, to sit inside another card. */
  bare?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const money = (n: number, ccy = review.currency) => formatMoneyExact(n, ccy);
  const r = review.result;
  const estimate = review.kind === "COST_ESTIMATE";
  const pct = review.billed > 0 ? Math.round((review.savings / review.billed) * 100) : 0;
  const byLine = new Map<number, Finding[]>();
  for (const f of r.findings) if (f.line != null) byLine.set(f.line, [...(byLine.get(f.line) ?? []), f]);
  const general = r.findings.filter((f) => f.line == null);

  async function decide(decision: "ACCEPTED" | "WAIVED") {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch(`/api/bill-reviews/${review.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The decision could not be saved."));
        return;
      }
      const body = await res.json();
      onChanged?.({ ...review, ...body.review, result: review.result });
    } finally {
      setBusy(null);
    }
  }

  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>
          <span className="inline-flex items-center gap-2">
            <ReceiptText size={16} aria-hidden className="text-muted" />
            Bill review{title ? <span className="font-normal text-muted">· {title}</span> : null}
          </span>
        </SectionTitle>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS[review.status].className}`}>
          {STATUS[review.status].label}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-muted">{estimate ? "Estimated" : "Billed"}</dt>
          <dd className="text-lg font-semibold tabular-nums text-ink">{money(review.billed)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Reference tariff</dt>
          <dd className="text-lg font-semibold tabular-nums text-ink">{money(review.recommended)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{estimate ? "Above reference" : "Saving"}</dt>
          <dd className="text-lg font-semibold tabular-nums text-brand">
            {review.savings > 0 ? <CountUp value={review.savings} durationMs={700} format={(n) => money(n)} /> : money(0)}
            {review.savings > 0 ? <span className="ml-1 text-sm font-medium text-muted">({pct}%)</span> : null}
          </dd>
        </div>
      </dl>

      {r.guarantee && r.guarantee.exceedsBy > 0 ? (
        <p className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
          Billed {money(r.guarantee.exceedsBy, r.guarantee.currency)} above the guarantee {r.guarantee.ref} ({money(r.guarantee.amount, r.guarantee.currency)}).{" "}
          {r.guarantee.recommendedExceedsBy > 0
            ? `Still ${money(r.guarantee.recommendedExceedsBy, r.guarantee.currency)} above it after review: a top-up needs approval.`
            : "After review it is within the guarantee: no top-up needed."}
        </p>
      ) : r.guarantee ? (
        <p className="mt-3 text-sm text-muted">Within the guarantee {r.guarantee.ref} ({money(r.guarantee.amount, r.guarantee.currency)}).</p>
      ) : null}
      {estimate && review.savings > 0 ? (
        <p className="mt-3 text-sm text-muted">
          Before treatment this is advice: the guarantee isn&apos;t cut on price, so the hospital never asks the traveller for a deposit.
          {r.notCovered > 0 ? ` ${money(r.notCovered)} of items that are never covered was taken off.` : ""} The reviewed amount is the reserve.
        </p>
      ) : null}

      {r.findings.length > 0 ? (
        <ol className="mt-4 divide-y divide-line rounded-lg border border-line">
          {r.lines.map((l, i) => {
            const fs = byLine.get(i) ?? [];
            const changed = l.recommended < l.billed;
            return (
              <li key={i} className={`flex gap-3 px-3 py-2 text-sm ${changed ? "bg-warn/5" : ""}`}>
                <span className="w-5 shrink-0 pt-0.5 text-xs tabular-nums text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink [overflow-wrap:anywhere]">
                    {l.description}
                    {l.quantity && l.quantity > 1 ? <span className="text-muted"> × {l.quantity}</span> : null}
                    {l.code ? <span className="ml-2 text-xs tabular-nums text-muted">{l.code}</span> : null}
                  </p>
                  {fs.map((f, j) => (
                    <p key={j} className={`mt-0.5 text-xs ${f.saving > 0 ? "text-ink" : "text-muted"}`}>
                      {f.reason}
                    </p>
                  ))}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  {changed ? <p className="text-xs text-muted line-through">{money(l.billed)}</p> : null}
                  <p className={changed ? "font-semibold text-ink" : "text-ink"}>{money(l.recommended)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Check size={15} aria-hidden className="text-brand" /> Every line is within the reference tariff.
        </p>
      )}
      {general.map((f, i) => (
        <p key={i} className="mt-2 text-xs text-muted">
          {f.reason}
        </p>
      ))}

      {error ? (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      ) : null}
      {review.status === "PROPOSED" && review.savings > 0 && !estimate ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => void decide("ACCEPTED")} busy={busy === "ACCEPTED"} disabled={busy != null}>
            <Check size={15} aria-hidden /> Accept: pay {money(review.recommended)}
          </Button>
          <Button variant="secondary" onClick={() => void decide("WAIVED")} busy={busy === "WAIVED"} disabled={busy != null}>
            Pay as billed
          </Button>
        </div>
      ) : review.decidedBy ? (
        <p className="mt-3 text-xs text-muted">
          {review.status === "ACCEPTED" ? "Accepted" : "Waived"} by {formatActor(review.decidedBy)}
          {review.decidedAt ? `, ${formatDateTime(review.decidedAt)}` : ""}
        </p>
      ) : null}
      <p className="mt-3 text-[11px] text-muted">
        Fictional demo tariff ({review.ruleset}). Prices up to 25% above the reference are accepted; comfort items and duplicates aren&apos;t covered.
        A person decides.
      </p>
    </>
  );

  return bare ? <div>{content}</div> : <Card className="animate-fade-up">{content}</Card>;
}
