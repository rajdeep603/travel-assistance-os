"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { T, useT } from "@/components/i18n";
import { ACTIVITY_SERIES, SERIES_COLORS, SERIES_LABELS, type Activity, type ActivityBucket } from "@/lib/dashboard-series";

// ---------------------------------------------------------------------------
// What the AI handled, bucket by bucket over the period: one stacked column
// per day (per three days over 90 days), the series in the KPI cards'
// colours. Hovering a column shows its figures; a table carries the same
// figures for screen readers.
// ---------------------------------------------------------------------------

const MIN_HEIGHT = 220;
const AXIS_W = 30;
const AXIS_H = 26;
/** Room above the top gridline for its value, and right of the last column for its date. */
const PAD_TOP = 8;
const PAD_END = 14;
const GAP = 2;

/** A clean axis maximum (1, 2, 5 × 10ⁿ) with four steps. */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((m) => m * pow >= raw)! * pow;
  return step * 4;
}

/** A column segment with a 4 px rounded data end on top only. */
function topRounded(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function PeriodSelect({ days, periods, night }: { days: number; periods: readonly number[]; night: string | null }) {
  const router = useRouter();
  const t = useT();
  return (
    <select
      aria-label={t("Period")}
      value={days}
      onChange={(e) => router.push(`/?days=${e.target.value}${night ? `&night=${night}` : ""}`, { scroll: false })}
      className="h-9 rounded-xl border border-line bg-surface py-1 pl-3 text-xs font-semibold text-ink"
    >
      {periods.map((d) => (
        <option key={d} value={d}>
          {t(`Last ${d} days`)}
        </option>
      ))}
    </select>
  );
}

export function ActivityChart({
  activity,
  periods,
  night,
  timeZone,
  locale,
}: {
  activity: Activity;
  /** The periods to choose from (7, 30, 90 days); the activity's own is selected. */
  periods: readonly number[];
  night: string | null;
  timeZone: string;
  locale: string;
}) {
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: MIN_HEIGHT });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: Math.max(MIN_HEIGHT, Math.floor(entry.contentRect.height)) })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { buckets } = activity;
  const totalOf = (b: ActivityBucket) => ACTIVITY_SERIES.reduce((sum, s) => sum + b[s], 0);
  const max = niceMax(Math.max(0, ...buckets.map(totalOf)));
  const { width, height } = size;
  const plotW = Math.max(0, width - AXIS_W - PAD_END);
  const plotH = height - AXIS_H - PAD_TOP;
  const slot = buckets.length ? plotW / buckets.length : 0;
  const barW = Math.max(3, Math.min(18, slot * 0.62));
  const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone });
  const labelOf = (b: ActivityBucket) => day.format(new Date(activity.bucketDays > 1 ? b.start : b.end));
  // About six date labels, whatever the width.
  const every = Math.max(1, Math.ceil(buckets.length / Math.max(2, Math.floor(plotW / 80))));
  const empty = buckets.every((b) => totalOf(b) === 0);
  const shown = hover == null ? null : buckets[hover];

  return (
    <section aria-labelledby="activity-title" className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="activity-title" className="text-lg font-semibold text-ink">
            <T>Activity overview</T>
          </h2>
          <p className="text-xs text-muted">
            <T>{activity.bucketDays > 1 ? "What the AI handled, every three days" : "What the AI handled, day by day"}</T>
          </p>
        </div>
        <PeriodSelect days={activity.days} periods={periods} night={night} />
      </div>

      <div ref={boxRef} className="relative mt-4 min-h-[220px] flex-1" onMouseLeave={() => setHover(null)}>
        {width > 0 ? (
          <svg width={width} height={height} className="absolute inset-0 block" aria-hidden>
            {/* Gridlines and their values. */}
            {[0, 1, 2, 3, 4].map((i) => {
              const v = (max / 4) * i;
              return (
                <g key={i}>
                  <line x1={AXIS_W} x2={width - PAD_END} y1={y(v) + 0.5} y2={y(v) + 0.5} stroke="rgb(var(--c-line))" strokeWidth="1" />
                  <text x={AXIS_W - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                    {v}
                  </text>
                </g>
              );
            })}
            {buckets.map((b, i) => {
              const x = AXIS_W + i * slot + (slot - barW) / 2;
              const present = ACTIVITY_SERIES.filter((s) => b[s] > 0);
              let base = PAD_TOP + plotH;
              const dim = hover != null && hover !== i;
              return (
                <g key={b.end} opacity={dim ? 0.45 : 1} className="transition-opacity duration-150">
                  {present.map((s, k) => {
                    const h = (b[s] / max) * plotH;
                    const top = base - h;
                    const segH = Math.max(1, h - (k < present.length - 1 ? GAP : 0));
                    const shape =
                      k === present.length - 1 ? (
                        <path key={s} d={topRounded(x, top, barW, h)} fill={SERIES_COLORS[s]} />
                      ) : (
                        <rect key={s} x={x} y={top + (h - segH)} width={barW} height={segH} fill={SERIES_COLORS[s]} />
                      );
                    base = top;
                    return shape;
                  })}
                  {i % every === (buckets.length - 1) % every ? (
                    <text x={Math.min(x + barW / 2, width - 24)} y={height - 6} textAnchor="middle" className="fill-muted text-[11px]">
                      {labelOf(b)}
                    </text>
                  ) : null}
                  {/* The hover target: the whole slot, taller than the column. */}
                  <rect x={AXIS_W + i * slot} y={0} width={slot} height={PAD_TOP + plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
        ) : null}

        {empty && width > 0 ? (
          <p className="absolute inset-x-0 top-[40%] text-center text-sm text-muted">
            <T>Nothing handled in this period yet.</T>
          </p>
        ) : null}

        {shown && hover != null ? (
          <div
            role="presentation"
            className="pointer-events-none absolute top-2 z-10 w-48 rounded-xl border border-line bg-surface p-3 text-xs shadow-card-hover"
            style={{
              left: Math.min(Math.max(0, AXIS_W + hover * slot + slot / 2 - 96), Math.max(0, width - 192)),
            }}
          >
            <p className="mb-1.5 font-semibold text-ink">
              {activity.bucketDays > 1 ? `${day.format(new Date(shown.start))} – ${day.format(new Date(shown.end))}` : labelOf(shown)}
            </p>
            {[...ACTIVITY_SERIES].reverse().map((s) => (
              <p key={s} className="flex items-center gap-2 py-0.5 text-muted">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SERIES_COLORS[s] }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t(SERIES_LABELS[s])}</span>
                <span className="font-semibold tabular-nums text-ink">{shown[s]}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
        {[...ACTIVITY_SERIES].reverse().map((s) => (
          <li key={s} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLORS[s] }} aria-hidden />
            <T>{SERIES_LABELS[s]}</T>
          </li>
        ))}
      </ul>

      {/* The same figures as a table, for screen readers. */}
      <div className="sr-only">
      <table>
        <caption>
          <T>Activity overview</T>
        </caption>
        <thead>
          <tr>
            <th scope="col">{t("Date")}</th>
            {ACTIVITY_SERIES.map((s) => (
              <th key={s} scope="col">
                {t(SERIES_LABELS[s])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.end}>
              <th scope="row">{labelOf(b)}</th>
              {ACTIVITY_SERIES.map((s) => (
                <td key={s}>{b[s]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
