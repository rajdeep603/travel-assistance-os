import Link from "next/link";
import { STATUS_DOTS } from "@/components/ui";
import { formatEnum } from "@/lib/format";
import { T } from "@/components/i18n";

// ---------------------------------------------------------------------------
// A status distribution as one segmented bar with a legend: how a caseload
// or the claims pipeline splits, read at a glance from across the stand.
// ---------------------------------------------------------------------------

export function StatusMix({
  title,
  noun,
  counts,
  order,
  href,
  columns,
}: {
  title: string;
  /** Legend columns on wider screens: pick what fills whole rows (3 for six statuses, 4 for eight). */
  columns: 3 | 4;
  /** "cases", "claims": after the total. */
  noun: string;
  counts: Record<string, number>;
  order: string[];
  href: string;
}) {
  const rows = order.map((status) => ({ status, count: counts[status] ?? 0 }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const shown = rows.filter((r) => r.count > 0);
  return (
    <section aria-label={title} className="flex h-full flex-col rounded-2xl border border-line/80 bg-surface p-5 shadow-sm md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-ink"><T>{title}</T></h2>
        <Link href={href} className="text-xs font-medium text-brand underline-offset-2 hover:underline">
          <T>{`View all ${noun}`}</T>
        </Link>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-ink">
        {total} <span className="text-sm font-medium text-muted"><T>{noun}</T></span>
      </p>

      {total ? (
        <>
          <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={shown.map((r) => `${formatEnum(r.status)}: ${r.count}`).join(", ")}>
            {shown.map((r, i) => (
              <span
                key={r.status}
                className={`animate-bar-grow h-full ${STATUS_DOTS[r.status] ?? "bg-slate-400"}`}
                style={{ flex: `${r.count} 1 0%`, animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
          <ul className={`mt-4 grid flex-1 grid-cols-2 content-start gap-x-4 gap-y-2.5 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
            {rows.map((r) => (
              <li key={r.status} className={`min-w-0 ${r.count ? "" : "opacity-50"}`}>
                <span className="flex items-baseline gap-1.5 text-xs leading-tight text-muted">
                  <span className={`h-2 w-2 shrink-0 translate-y-px rounded-full ${STATUS_DOTS[r.status] ?? "bg-slate-400"}`} aria-hidden />
                  <span><T>{formatEnum(r.status)}</T></span>
                </span>
                <span className="mt-0.5 block pl-3.5 text-lg font-semibold tabular-nums leading-tight text-ink">{r.count}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">No {noun} yet.</p>
      )}
    </section>
  );
}
