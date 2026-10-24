"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronRight, UserRoundCheck } from "lucide-react";
import { T, useT } from "@/components/i18n";

interface Decision {
  count: number;
  label: string;
  href: string;
}

const REFRESH_MS = 60_000;

/**
 * The header's bell: the decisions waiting for a person (the overview's
 * "Needs a person"), each opening the record to decide on. A dot shows when
 * anything is waiting.
 */
export function AttentionBell() {
  const pathname = usePathname();
  const t = useT();
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fetched on every page change and every minute, so a decision made elsewhere clears the dot.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/overview/attention")
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (!cancelled && body?.decisions) setDecisions(body.decisions);
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pathname]);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const total = decisions?.reduce((sum, d) => sum + d.count, 0) ?? 0;
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={total ? `${t("Needs a person")}: ${total}` : t("Needs a person")}
        title={t("Needs a person")}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-canvas hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Bell size={19} strokeWidth={1.9} aria-hidden />
        {total ? <span className="absolute right-2.5 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-surface" aria-hidden /> : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t("Needs a person")}
          className="animate-modal-in absolute end-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-2 shadow-card-hover"
        >
          <div className="flex items-baseline justify-between gap-3 px-3 pb-1 pt-2">
            <p className="text-sm font-semibold text-ink">
              <T>Needs a person</T>
            </p>
            <span className="text-xs tabular-nums text-muted">{total ? <>{total} <T>waiting</T></> : <T>All clear</T>}</span>
          </div>
          <p className="px-3 pb-2 text-xs text-muted">
            <T>The AI prepared each of these. A person makes the call.</T>
          </p>
          {total ? (
            <ul className="flex flex-col">
              {decisions!.map((d) => (
                <li key={d.label}>
                  <Link
                    href={d.href}
                    className="group flex min-h-[2.75rem] items-center gap-3 rounded-xl px-3 transition-colors duration-150 hover:bg-warn/10"
                  >
                    <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-warn/15 px-2 text-sm font-semibold tabular-nums text-amber-800">
                      {d.count}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-ink">
                      <T>{d.label}</T>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-slate-400 transition-colors group-hover:text-amber-700 rtl:rotate-180" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="m-1 flex flex-col items-center rounded-xl bg-canvas py-5 text-center">
              <UserRoundCheck size={22} className="text-live" aria-hidden />
              <p className="mt-1.5 text-sm font-medium text-ink">
                <T>Nothing waiting</T>
              </p>
              <p className="text-xs text-muted">
                <T>Every decision has been made.</T>
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
