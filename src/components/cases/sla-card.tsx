import { AlarmClock, CircleAlert, CircleCheck, Timer } from "lucide-react";
import { T } from "@/components/i18n";
import { Card, SectionTitle } from "@/components/ui";
import { formatSlaDuration, type SlaMilestone, type SlaState } from "@/lib/sla";

// ---------------------------------------------------------------------------
// The case's service levels: each step against its target, the way an insurer
// audits its assistance company. Running clocks show how long is left.
// ---------------------------------------------------------------------------

const STATE: Record<SlaState, { label: string; Icon: typeof CircleCheck; tone: string }> = {
  met: { label: "Within target", Icon: CircleCheck, tone: "text-emerald-600" },
  missed: { label: "Over target", Icon: CircleAlert, tone: "text-amber-600" },
  running: { label: "Running", Icon: Timer, tone: "text-brand" },
  overdue: { label: "Overdue", Icon: AlarmClock, tone: "text-rose-600" },
};

export function SlaCard({ sla }: { sla: SlaMilestone[] }) {
  if (!sla.length) return null;
  return (
    <Card>
      <SectionTitle>Service levels</SectionTitle>
      <ul className="mt-3 space-y-3">
        {sla.map((m) => {
          const { label, Icon, tone } = STATE[m.state];
          return (
            <li key={m.key} className="flex items-start gap-3">
              <Icon size={18} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  <T>{m.label}</T>
                  {m.ref ? <span className="ml-1.5 text-xs font-normal text-muted" translate="no">{m.ref}</span> : null}
                </p>
                <p className="text-xs text-muted">
                  <T>{m.basis}</T> · <T>target</T> {formatSlaDuration(m.targetSeconds)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-semibold tabular-nums ${tone}`}>{formatSlaDuration(m.seconds)}</p>
                <p className="text-[11px] text-muted"><T>{label}</T></p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted">Example targets; each client contract sets its own.</p>
    </Card>
  );
}
