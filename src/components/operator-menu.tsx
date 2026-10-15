"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

/** Signed-in operator name with a sign-out control (header). Hidden when sign-in is off. */
export function OperatorMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [operator, setOperator] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  if (!operator) return null;

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setOperator(null);
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pl-3 pr-1 text-xs text-slate-600">
      <span className="font-medium capitalize">{operator}</span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        aria-label="Sign out"
        className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50"
      >
        <LogOut size={14} aria-hidden />
      </button>
    </div>
  );
}
