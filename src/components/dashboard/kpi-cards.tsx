import Link from "next/link";
import { BriefcaseMedical, FileCheck2, Mail, PhoneCall, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { T } from "@/components/i18n";
import { SERIES_COLORS, SERIES_LABELS, runningTotals, trendShare, type Activity, type ActivitySeries } from "@/lib/dashboard-series";

// ---------------------------------------------------------------------------
// The four headline figures: what the AI handled in the period, the change
// against the period before (or, with nothing before it, how many came in
// lately), and a sparkline of the running total.
// ---------------------------------------------------------------------------

const CARDS: { series: ActivitySeries; icon: LucideIcon; tile: string; href: string }[] = [
  { series: "cases", icon: BriefcaseMedical, tile: "bg-blue-50 text-blue-600", href: "/cases" },
  { series: "claims", icon: FileCheck2, tile: "bg-purple-50 text-purple-600", href: "/claims" },
  { series: "calls", icon: PhoneCall, tile: "bg-emerald-50 text-emerald-600", href: "/calls" },
  { series: "messages", icon: Mail, tile: "bg-amber-50 text-amber-600", href: "/inbox" },
];

const VS_PREVIOUS: Record<number, string> = { 7: "vs previous 7 days", 30: "vs previous 30 days", 90: "vs previous 90 days" };
const LATELY: Record<number, string> = { 1: "in the last 24 hours", 7: "in the last 7 days" };

/** A smooth line through the points (Catmull-Rom as cubic Béziers). */
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[Math.max(0, i - 1)];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[Math.min(points.length - 1, i + 2)];
    const c1 = [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6];
    const c2 = [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return d;
}

function Sparkline({ values, color, id }: { values: number[]; color: string; id: string }) {
  const W = 120;
  const H = 44;
  const max = Math.max(1, ...values);
  const pad = 5;
  const points = values.map((v, i): [number, number] => [
    values.length === 1 ? W : (i / (values.length - 1)) * (W - pad),
    H - pad - (v / max) * (H - pad * 2),
  ]);
  const line = smoothPath(points);
  const last = points.at(-1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-24 shrink-0 overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.18" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {line ? (
        <>
          <path d={`${line} L${last![0]},${H} L${points[0][0]},${H} Z`} fill={`url(#${id})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={last![0]} cy={last![1]} r="3.5" fill={color} stroke="white" strokeWidth="2" />
        </>
      ) : null}
    </svg>
  );
}

export function KpiCards({ activity }: { activity: Activity }) {
  const lately = activity.days > 7 ? 7 : 1;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:sidebar-hidden:grid-cols-4 xl:grid-cols-4">
      {CARDS.map(({ series, icon: Icon, tile, href }) => {
        const total = activity.totals[series];
        const share = trendShare(total, activity.previous[series]);
        const pct = share == null ? null : Math.round(share * 100);
        const Trend = pct != null && pct < 0 ? TrendingDown : TrendingUp;
        return (
          <Link
            key={series}
            href={href}
            className="group flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition-[box-shadow,border-color] duration-150 hover:border-brand/30 hover:shadow-card-hover focus-visible:outline-brand"
          >
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tile}`}>
                <Icon size={19} aria-hidden />
              </span>
              <p className="min-w-0 text-sm font-medium leading-snug text-slate-600">
                <T>{SERIES_LABELS[series]}</T>
              </p>
            </div>
            <div className="mt-3 flex flex-1 items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[1.875rem] font-bold leading-none tracking-tight text-ink">
                  <CountUp value={total} />
                </p>
                <p className="mt-2 text-xs leading-snug text-muted">
                  <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${pct != null && pct < 0 ? "text-slate-600" : "text-emerald-600"}`}>
                    <Trend size={14} aria-hidden />
                    {pct != null ? `${pct > 0 ? "+" : ""}${pct}%` : `+${activity.recent[series]}`}
                  </span>
                  <span className="block">
                    <T>{pct != null ? VS_PREVIOUS[activity.days] : LATELY[lately]}</T>
                  </span>
                </p>
              </div>
              <Sparkline values={runningTotals(activity.buckets, series)} color={SERIES_COLORS[series]} id={`spark-${series}`} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
