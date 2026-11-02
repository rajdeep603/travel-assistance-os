import { Star } from "lucide-react";

/** A 1–5 rating as stars, with the figure beside them. */
export function Stars({ value, size = 13, className = "" }: { value: number | null | undefined; size?: number; className?: string }) {
  if (value == null) return <span className={`text-xs text-muted ${className}`}>no rating</span>;
  const full = Math.round(value);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} title={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= full ? "text-amber-400" : "text-slate-200"} fill="currentColor" aria-hidden />
      ))}
      <span className="ms-1 text-xs font-semibold tabular-nums text-ink">{value.toFixed(1)}</span>
    </span>
  );
}
