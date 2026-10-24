"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { formatEnum } from "@/lib/format";

// ---------------------------------------------------------------------------
// How the caseload, or the claims pipeline, splits by status: a donut with
// the total in the middle and a legend with each count and share. Claims are
// grouped into five stages so the ring stays readable.
// ---------------------------------------------------------------------------

interface Slice {
  key: string;
  label: string;
  count: number;
  color: string;
}

/** Case statuses in their order, coloured as their badges are. */
const CASE_SLICES: { status: string; color: string }[] = [
  { status: "NEW", color: "#38bdf8" },
  { status: "IN_PROGRESS", color: "#2563eb" },
  { status: "PENDING_INFO", color: "#f59e0b" },
  { status: "ESCALATED", color: "#ef4444" },
  { status: "RESOLVED", color: "#10b981" },
  { status: "CLOSED", color: "#94a3b8" },
];

/** Claim statuses grouped into stages (colour-checked in this order). */
const CLAIM_STAGES: { label: string; statuses: string[]; color: string }[] = [
  { label: "In review", statuses: ["SUBMITTED", "PROCESSING"], color: "#38bdf8" },
  { label: "Needs a person", statuses: ["NEEDS_REVIEW", "INFO_REQUESTED", "ESCALATED"], color: "#f59e0b" },
  { label: "Approved", statuses: ["APPROVED"], color: "#2563eb" },
  { label: "Paid", statuses: ["PAID"], color: "#10b981" },
  { label: "Rejected", statuses: ["REJECTED"], color: "#ef4444" },
];

const R = 64;
const STROKE = 20;
const C = 2 * Math.PI * R;

function Donut({ slices, total, active, onActive, center }: { slices: Slice[]; total: number; active: string | null; onActive: (k: string | null) => void; center: string }) {
  const shown = slices.filter((s) => s.count > 0);
  // A 2 px surface gap between segments (none when one segment fills the ring).
  const gap = shown.length > 1 ? 2.5 : 0;
  let offset = 0;
  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="80" cy="80" r={R} fill="none" stroke="rgb(var(--c-line))" strokeWidth={STROKE} />
        {total
          ? shown.map((s) => {
              const len = (s.count / total) * C;
              const dash = Math.max(0.5, len - gap);
              const el = (
                <circle
                  key={s.key}
                  cx="80"
                  cy="80"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === s.key ? STROKE + 4 : STROKE}
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                  opacity={active && active !== s.key ? 0.4 : 1}
                  className="cursor-default transition-[opacity,stroke-width] duration-150"
                  onMouseEnter={() => onActive(s.key)}
                  onMouseLeave={() => onActive(null)}
                />
              );
              offset += len;
              return el;
            })
          : null}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight text-ink">{total.toLocaleString("en-GB")}</span>
        <span className="text-xs text-muted">
          <T>{center}</T>
        </span>
      </div>
    </div>
  );
}

export function StatusDonut({ caseCounts, claimCounts }: { caseCounts: Record<string, number>; claimCounts: Record<string, number> }) {
  const t = useT();
  const [view, setView] = useState<"cases" | "claims">("cases");
  const [active, setActive] = useState<string | null>(null);
  const slices: Slice[] =
    view === "cases"
      ? CASE_SLICES.map(({ status, color }) => ({ key: status, label: formatEnum(status), count: caseCounts[status] ?? 0, color }))
      : CLAIM_STAGES.map(({ label, statuses, color }) => ({ key: label, label, count: statuses.reduce((n, s) => n + (claimCounts[s] ?? 0), 0), color }));
  const total = slices.reduce((n, s) => n + s.count, 0);

  return (
    <section aria-labelledby="status-title" className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="status-title" className="text-lg font-semibold text-ink">
          <T>{view === "cases" ? "Case status" : "Claims pipeline"}</T>
        </h2>
        <div className="inline-flex rounded-xl bg-canvas p-0.5 ring-1 ring-line" role="group" aria-label={t("Show")}>
          {(["cases", "claims"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                setActive(null);
              }}
              className={`rounded-[10px] px-3 py-1 text-xs font-semibold transition-colors duration-150 ${view === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              <T>{v === "cases" ? "Cases" : "Claims"}</T>
            </button>
          ))}
        </div>
      </div>

      {/* Beside the legend when the card has the width (a full row); above it in the dashboard's third column. */}
      <div className="mt-4 flex flex-1 flex-col items-center gap-4 sm:flex-row sm:gap-8 lg:flex-col lg:gap-4">
        <Donut slices={slices} total={total} active={active} onActive={setActive} center={view === "cases" ? "Total cases" : "Total claims"} />
        <ul className="w-full min-w-0 flex-1 space-y-0.5 sm:max-w-sm lg:max-w-none">
          {slices.map((s) => (
            <li
              key={s.key}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(null)}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 ${active === s.key ? "bg-canvas" : ""} ${s.count ? "" : "opacity-50"}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-slate-700">
                <T>{s.label}</T>
              </span>
              <span className="font-semibold tabular-nums text-ink">{s.count}</span>
              <span className="w-10 text-end text-xs tabular-nums text-muted">{total ? `${Math.round((s.count / total) * 100)}%` : "–"}</span>
            </li>
          ))}
        </ul>
      </div>

      <Link href={view === "cases" ? "/cases" : "/claims"} className="mt-3 inline-flex items-center gap-1 self-start text-sm font-semibold text-brand hover:underline hover:underline-offset-2">
        <T>{view === "cases" ? "View all cases" : "View all claims"}</T>
        <ArrowRight size={15} className="rtl:rotate-180" aria-hidden />
      </Link>
    </section>
  );
}
