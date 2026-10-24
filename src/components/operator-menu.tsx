"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { T } from "@/components/i18n";

/** The signed-in operator as an avatar, with sign-out in its menu (header). Hidden when sign-in is off. */
export function OperatorMenu() {
  const pathname = usePathname();
  const [operator, setOperator] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled) setOperator(body?.operator ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

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

  if (!operator) return null;

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // A full page load drops the client router cache of signed-in pages.
      window.location.assign("/login");
    }
  }

  const initials = operator
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-2.5 rounded-xl py-1 pe-1.5 ps-1 text-start transition-colors hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand" aria-hidden>
          {initials || <UserRound size={17} />}
        </span>
        <span className="hidden min-w-0 leading-tight xl:block">
          <span className="block max-w-[10rem] truncate text-sm font-semibold capitalize text-ink">{operator}</span>
          <span className="block text-xs text-muted"><T>Operator</T></span>
        </span>
        <ChevronDown size={15} className="hidden text-muted xl:block" aria-hidden />
        <span className="sr-only">{operator}</span>
      </button>
      {open ? (
        <div role="menu" className="animate-modal-in absolute end-0 top-full z-40 mt-2 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-card-hover">
          <p className="px-3 pb-2 pt-1.5 text-xs text-muted">
            <T>Signed in as</T> <span className="font-semibold capitalize text-ink">{operator}</span>
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={busy}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <LogOut size={16} className="text-muted" aria-hidden />
            <T>Sign out</T>
          </button>
        </div>
      ) : null}
    </div>
  );
}
