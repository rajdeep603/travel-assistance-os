import { BadgeCheck } from "lucide-react";

/** An accreditation or licence on a provider: JCI, ISO 9001, EURAMI, … */
export function AccreditationBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand/20 bg-brand/[0.06] px-2 py-0.5 text-[11px] font-medium text-brand">
      <BadgeCheck size={12} aria-hidden /> {name}
    </span>
  );
}
