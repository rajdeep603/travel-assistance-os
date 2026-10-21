"use client";

import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3 } from "lucide-react";
import {
  OPERATION_TIME_ZONE,
  TIME_ZONES,
  TIME_ZONE_REGIONS,
  applyDisplayTimeZone,
  setDisplayTimeZone,
  timeZoneClock,
  timeZoneLabel,
  timeZoneOffset,
} from "@/lib/time-zone";

// ---------------------------------------------------------------------------
// The display time zone, chosen in the header. Changing it remounts the page
// (every client component formats again) and re-renders the server parts
// (router.refresh reads the new cookie), so each time on screen moves at once.
// ---------------------------------------------------------------------------

interface TimeZoneContextValue {
  zone: string;
  setZone: (zone: string) => void;
}

const TimeZoneContext = createContext<TimeZoneContextValue>({ zone: OPERATION_TIME_ZONE, setZone: () => undefined });

export function useTimeZone(): TimeZoneContextValue {
  return useContext(TimeZoneContext);
}

export function TimeZoneProvider({ initial, children }: { initial: string; children: ReactNode }) {
  const router = useRouter();
  const [zone, setZoneState] = useState(initial);
  // Formatting reads the module-level zone: keep it in step on the server (per
  // render) and in the browser, before anything below renders.
  applyDisplayTimeZone(zone);

  const setZone = useCallback(
    (next: string) => {
      const applied = setDisplayTimeZone(next);
      setZoneState(applied);
      router.refresh();
    },
    [router]
  );

  const value = useMemo(() => ({ zone, setZone }), [zone, setZone]);
  return (
    <TimeZoneContext.Provider value={value}>
      <Fragment key={zone}>{children}</Fragment>
    </TimeZoneContext.Provider>
  );
}

/** A ticking "HH:MM" in the zone, updated on the minute. */
function useClock(zone: string): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const toMinute = 60_000 - (Date.now() % 60_000);
    let interval: number | undefined;
    const first = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, toMinute);
    return () => {
      window.clearTimeout(first);
      if (interval) window.clearInterval(interval);
    };
  }, []);
  return timeZoneClock(zone, now);
}

/**
 * The header's clock: the city and the time there. Opens the list of zones,
 * each with its current time, grouped by region; the operation's own zone first.
 */
export function TimeZoneSwitch() {
  const { zone, setZone } = useTimeZone();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const clock = useClock(zone);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    // The chosen zone in view when the list opens.
    listRef.current?.querySelector<HTMLElement>("[aria-checked='true']")?.scrollIntoView({ block: "center" });
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (id: string) => {
    setOpen(false);
    if (id !== zone) setZone(id);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Times on screen are shown in this time zone"
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-2.5 pr-3 text-[11px] font-semibold text-muted transition-colors hover:border-brand/50 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Clock3 size={13} aria-hidden />
        <span className="hidden sm:inline">{timeZoneLabel(zone)}</span>
        <span className="tabular-nums text-ink" suppressHydrationWarning>
          {clock}
        </span>
      </button>

      {open ? (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Display time zone"
          className="animate-modal-in absolute right-0 top-full z-40 mt-2 max-h-[min(70dvh,520px)] w-72 overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-card-hover"
        >
          <p className="px-3 pb-2 pt-1.5 text-xs text-muted">Every date and time on screen is shown in the zone you pick.</p>
          {TIME_ZONE_REGIONS.map((region) => {
            const zones = TIME_ZONES.filter((z) => z.region === region);
            if (!zones.length) return null;
            return (
              <div key={region} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-medium text-muted">{region === "Operation" ? "Where the operation runs" : region}</p>
                {zones.map((z) => {
                  const on = z.id === zone;
                  return (
                    <button
                      key={z.id}
                      type="button"
                      role="option"
                      aria-checked={on}
                      aria-selected={on}
                      onClick={() => choose(z.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 ${
                        on ? "bg-brand bg-brand-gradient text-white shadow-glow" : "text-ink hover:bg-canvas"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{z.label}</span>
                      <span className={`text-xs tabular-nums ${on ? "text-white/80" : "text-muted"}`}>{now ? `${timeZoneClock(z.id, now)} · ${timeZoneOffset(z.id, now)}` : ""}</span>
                      {on ? <Check size={14} aria-hidden /> : <span className="w-3.5" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
