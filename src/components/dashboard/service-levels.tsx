import { CalendarCheck, FileCheck2, Hospital, PhoneCall, type LucideIcon } from "lucide-react";
import { T } from "@/components/i18n";
import { StatTile, TILE_TONES } from "@/components/ui";
import { formatSlaDuration, type SlaKey } from "@/lib/sla";
import type { ServiceLevel } from "@/lib/services/service-levels";

// ---------------------------------------------------------------------------
// The operation's service levels over the period: how often each step met its
// target, and the median time. What an insurer asks its assistance company for.
// ---------------------------------------------------------------------------

const LOOK: Record<SlaKey, { icon: LucideIcon; tone: keyof typeof TILE_TONES }> = {
  answer: { icon: PhoneCall, tone: "teal" },
  hospital: { icon: Hospital, tone: "rose" },
  guarantee: { icon: FileCheck2, tone: "blue" },
  appointment: { icon: CalendarCheck, tone: "violet" },
};

export function ServiceLevels({ levels, days }: { levels: ServiceLevel[]; days: number }) {
  return (
    <section aria-labelledby="sla-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sla-title" className="text-lg font-semibold text-ink">
          <T>Service levels</T>
        </h2>
        <p className="text-xs text-muted">
          <T>{`Last ${days} days`}</T> · <T>example targets; each client contract sets its own</T>
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {levels.map((l) => {
          const share = l.total ? Math.round((l.met / l.total) * 100) : null;
          return (
            <StatTile
              key={l.key}
              icon={LOOK[l.key].icon}
              tone={LOOK[l.key].tone}
              label={l.label}
              value={share === null ? "—" : `${share}%`}
              warn={share !== null && share < 80}
              note={
                l.total ? (
                  <>
                    {l.met}/{l.total} <T>within</T> {formatSlaDuration(l.targetSeconds)}
                    {l.medianSeconds !== null ? (
                      <>
                        {" · "}
                        <T>median</T> {formatSlaDuration(l.medianSeconds)}
                      </>
                    ) : null}
                  </>
                ) : (
                  <T>None in this period</T>
                )
              }
            />
          );
        })}
      </div>
    </section>
  );
}
