import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { T } from "@/components/i18n";

// ---------------------------------------------------------------------------
// The assistance journey as a route map: one line from the traveller to the
// operations team, a stop for each step the AI prepares, and the live count
// at each stop. The line draws itself once when the page loads; on a phone
// the route runs top to bottom.
// ---------------------------------------------------------------------------

export interface RouteStop {
  label: string;
  icon: LucideIcon;
  /** The live figure at this stop ("14 open"), or a short description at the ends. */
  detail: string;
  href?: string;
  /** "end": the traveller and the team; "ai": the one step that is the model thinking. */
  kind?: "end" | "ai";
}

const DRAW_MS = 1100;

function StopMarker({ stop, delay }: { stop: RouteStop; delay: number }) {
  const Icon = stop.icon;
  const tone =
    stop.kind === "end"
      ? "h-11 w-11 bg-stage-ink text-stage ring-4 ring-stage"
      : stop.kind === "ai"
        ? "h-9 w-9 bg-ai text-white ring-4 ring-stage"
        : "h-9 w-9 bg-stage-raised text-brand-2 ring-1 ring-stage-line outline outline-4 outline-stage group-hover:bg-brand-2 group-hover:text-stage";
  return (
    <span
      className={`animate-pop-in relative z-10 flex shrink-0 items-center justify-center rounded-full transition-colors duration-150 ${tone}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <Icon size={stop.kind === "end" ? 19 : 16} aria-hidden />
    </span>
  );
}

export function JourneyRoute({ stops }: { stops: RouteStop[] }) {
  const n = stops.length;
  // The line runs between the centres of the first and last stops.
  const inset = `calc(100% / ${n * 2})`;
  return (
    <div className="relative">
      {/* The track and the line that draws over it: across on wide screens, down on phones. */}
      <span aria-hidden className="absolute bottom-5 left-[21px] top-5 w-0.5 bg-stage-line md:hidden" />
      <span aria-hidden className="animate-route-y absolute bottom-5 left-[21px] top-5 w-0.5 bg-gradient-to-b from-brand-2 to-live md:hidden" />
      <span aria-hidden className="absolute top-[21px] hidden h-0.5 bg-stage-line md:block" style={{ left: inset, right: inset }} />
      <span
        aria-hidden
        className="animate-route-x absolute top-[21px] hidden h-0.5 bg-gradient-to-r from-brand-2 via-brand-2 to-live md:block"
        style={{ left: inset, right: inset }}
      />
      <ol
        aria-label="The assistance journey"
        className="relative grid gap-3 md:gap-0 md:[grid-template-columns:repeat(var(--stops),minmax(0,1fr))]"
        style={{ ["--stops" as string]: n }}
      >
        {stops.map((stop, i) => {
          // Each stop arrives as the line reaches it.
          const delay = Math.round((DRAW_MS * i) / Math.max(1, n - 1));
          const body = (
            <>
              {/* Every marker sits in the same 44 px box, so all of them centre on the line. */}
              <span className="flex h-11 w-11 shrink-0 items-center justify-center md:w-auto">
                <StopMarker stop={stop} delay={delay} />
              </span>
              <span className="animate-fade-in min-w-0 md:mt-2 md:px-1" style={{ animationDelay: `${delay + 80}ms` }}>
                <span
                  className={`block text-sm font-semibold leading-snug text-stage-ink md:text-xs lg:text-sm ${stop.href ? "group-hover:text-white group-hover:underline group-hover:underline-offset-4" : ""}`}
                >
                  {/* Narrow stops (an iPad in portrait) must not break "e-mail" into "e-" and "mail". */}
                  <T keepHyphenated>{stop.label}</T>
                </span>
                <span className={`mt-0.5 block text-xs leading-snug tabular-nums md:text-[11px] lg:text-xs ${stop.kind ? "text-stage-muted" : "font-medium text-brand-2"}`}>
                  {stop.detail}
                </span>
              </span>
            </>
          );
          const cls = "group flex items-center gap-3 rounded-xl md:flex-col md:items-center md:gap-0 md:text-center";
          return (
            <li key={stop.label}>
              {stop.href ? (
                <Link href={stop.href} className={`${cls} focus-visible:outline-brand-2`}>
                  {body}
                </Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
