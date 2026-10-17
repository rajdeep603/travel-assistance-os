import Link from "next/link";
import { ChevronRight, UserRoundCheck } from "lucide-react";

// ---------------------------------------------------------------------------
// What is waiting for a person: the AI has prepared the work (reviewed the
// bill, drafted the letter, checked the claim), and each row opens the exact
// record to decide on.
// ---------------------------------------------------------------------------

export interface Decision {
  count: number;
  label: string;
  href: string;
}

export function NeedsPerson({ decisions }: { decisions: Decision[] }) {
  const waiting = decisions.filter((d) => d.count > 0);
  const total = waiting.reduce((sum, d) => sum + d.count, 0);
  return (
    <section aria-labelledby="needs-title" className="flex h-full flex-col rounded-2xl border border-line/80 bg-surface p-5 shadow-sm md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="needs-title" className="text-base font-semibold text-ink">
          Needs a person
        </h2>
        <span className="text-xs tabular-nums text-muted">{total ? `${total} waiting` : "All clear"}</span>
      </div>
      <p className="mt-1 text-xs text-muted">The AI prepared each of these. A person makes the call.</p>

      {waiting.length ? (
        <ul className="mt-3 flex flex-1 flex-col divide-y divide-line">
          {waiting.map((d) => (
            <li key={d.label} className="flex-1">
              <Link
                href={d.href}
                className="group -mx-2 flex h-full min-h-[2.75rem] items-center gap-3 rounded-lg px-2 transition-colors duration-150 hover:bg-warn/10"
              >
                <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-warn/15 px-2 text-sm font-semibold tabular-nums text-amber-800">
                  {d.count}
                </span>
                <span className="min-w-0 flex-1 text-sm text-ink">{d.label}</span>
                <ChevronRight size={16} className="shrink-0 text-slate-400 transition-colors group-hover:text-amber-700" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center rounded-xl bg-canvas py-6 text-center">
          <UserRoundCheck size={24} className="text-live" aria-hidden />
          <p className="mt-2 text-sm font-medium text-ink">Nothing waiting</p>
          <p className="text-xs text-muted">Every decision has been made.</p>
        </div>
      )}
    </section>
  );
}
