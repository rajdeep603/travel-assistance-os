"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, X } from "lucide-react";

export interface CaseContext {
  id: string;
  ref: string;
  title: string;
  patient: { id: string; ref: string; firstName: string; lastName: string };
}

/** Loads the case a page was opened for (via ?caseId=), or null. */
export function useCaseContext(caseId: string | null): CaseContext | null {
  const [kase, setKase] = useState<CaseContext | null>(null);
  useEffect(() => {
    if (!caseId) {
      setKase(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/cases/${encodeURIComponent(caseId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled) setKase(body?.case ?? null);
      })
      .catch(() => {
        if (!cancelled) setKase(null);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);
  return kase;
}

/** "Working on CASE-1042" strip shown when a module was opened from a case. */
export function CaseContextBanner({
  kase,
  action,
  onClear,
}: {
  kase: CaseContext;
  action: string;
  onClear?: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
      <span className="flex items-center gap-2">
        <FolderKanban size={16} aria-hidden />
        <span>
          {action} for{" "}
          <Link href={`/cases/${kase.id}`} className="font-semibold underline-offset-2 hover:underline">
            {kase.ref}
          </Link>{" "}
          · {kase.patient.firstName} {kase.patient.lastName}
        </span>
      </span>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
        >
          <X size={13} aria-hidden /> Not for this case
        </button>
      ) : null}
    </div>
  );
}
