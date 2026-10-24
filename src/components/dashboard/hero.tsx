import Link from "next/link";
import { Calculator, Download, Mic } from "lucide-react";
import { LiveRefresh } from "@/components/live-refresh";
import { T } from "@/components/i18n";
import type { OverviewPeriod } from "@/lib/services/overview";
import { AskAiCard } from "./ask-ai-card";

// ---------------------------------------------------------------------------
// The dashboard's hero: the promise on a morning sky, a dotted world map with
// a flight on its way, and the way into the assistant. The flight path draws
// itself once on load; it is the screen's one orchestrated moment.
// ---------------------------------------------------------------------------

/** An airliner seen from above, nose to the right. */
function Plane({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path fill="currentColor" d="M3 16c0-.9.8-1.5 1.8-1.5h20.4c2.6 0 4.3.8 4.3 1.5s-1.7 1.5-4.3 1.5H4.8C3.8 17.5 3 16.9 3 16z" />
      <path fill="currentColor" d="M15.8 14.6 10.6 4.2h2.6l8.2 10.4zM15.8 17.4l-5.2 10.4h2.6l8.2-10.4zM5.6 14.6 3.4 9.6h1.9l3.6 5zM5.6 17.4l-2.2 5h1.9l3.6-5z" />
    </svg>
  );
}

/**
 * A flight over the map: a dashed route rising from the middle of the hero to
 * a plane above the Ask card, and a second, smaller plane further back.
 * Fixed pixel geometry anchored to the top corner, so it never stretches.
 */
function Flights() {
  return (
    <div aria-hidden className="pointer-events-none absolute end-[6%] top-[8%] hidden h-[150px] w-[300px] lg:block xl:w-[400px]">
      <svg
        viewBox="0 0 400 150"
        preserveAspectRatio="xMaxYMin meet"
        className="animate-reveal-x absolute inset-0 h-full w-full overflow-visible [mask-image:linear-gradient(to_right,transparent,black_40%)] rtl:-scale-x-100"
      >
        <path d="M0 140 C 120 140, 220 92, 342 40" fill="none" stroke="white" strokeWidth="2.5" strokeDasharray="6 8" strokeLinecap="round" />
        <path d="M150 62 C 190 52, 220 46, 250 44" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="4 6" strokeLinecap="round" opacity="0.75" />
      </svg>
      <div className="animate-pop-in absolute -end-1 -top-4 text-white drop-shadow-[0_8px_14px_rgb(29_78_216/0.45)] [animation-delay:1.1s]">
        <Plane className="h-16 w-16 -rotate-[24deg] rtl:-scale-x-100 rtl:rotate-[24deg]" />
      </div>
      <div className="animate-pop-in absolute end-[30%] top-[14%] text-white/95 drop-shadow-[0_4px_8px_rgb(29_78_216/0.35)] [animation-delay:0.7s]">
        <Plane className="h-8 w-8 -rotate-[8deg] rtl:-scale-x-100 rtl:rotate-[8deg]" />
      </div>
    </div>
  );
}

export function DashboardHero({ days }: { days: OverviewPeriod }) {
  return (
    <section aria-labelledby="hero-title" className="hero-sky relative overflow-hidden rounded-3xl border border-brand/10 px-5 py-6 md:px-8 md:py-8">
      <div aria-hidden className="hero-map pointer-events-none absolute inset-y-0 end-0 w-full opacity-70 lg:w-[80%]" />
      <Flights />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-xl">
          <span className="mb-3 inline-flex rounded-full bg-white/75 px-3 py-1 shadow-sm backdrop-blur">
            <LiveRefresh />
          </span>
          <h1 id="hero-title" className="text-[1.875rem] font-bold leading-[1.15] tracking-tight text-ink md:text-[2.5rem]">
            <T>AI-powered assistance for travel & health</T>
          </h1>
          <p className="mt-2 text-lg font-medium text-slate-600 md:text-xl">
            <T>Automate. Assist. Accelerate.</T>
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link
              href="/voice"
              className="inline-flex items-center gap-2 rounded-xl bg-brand bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-[filter,box-shadow] duration-150 hover:brightness-[1.07] focus-visible:outline-brand"
            >
              <Mic size={16} aria-hidden />
              <T>Talk to a voice agent</T>
            </Link>
            <Link
              href="/business-case"
              className="inline-flex items-center gap-2 rounded-xl border border-white bg-white/80 px-4 py-2.5 text-sm font-semibold text-ink shadow-sm backdrop-blur transition-colors duration-150 hover:bg-white focus-visible:outline-brand"
            >
              <Calculator size={16} className="text-brand" aria-hidden />
              <T>Your business case</T>
            </Link>
            <a
              href={`/api/overview/pdf?days=${days}`}
              download
              title="A one-page operations summary for this period, as a PDF"
              className="inline-flex items-center gap-2 rounded-xl border border-white bg-white/80 px-4 py-2.5 text-sm font-semibold text-ink shadow-sm backdrop-blur transition-colors duration-150 hover:bg-white focus-visible:outline-brand"
            >
              <Download size={16} className="text-brand" aria-hidden />
              <T>Summary PDF</T>
            </a>
          </div>
        </div>
        <div className="w-full shrink-0 lg:w-[22rem]">
          <AskAiCard />
        </div>
      </div>
    </section>
  );
}
