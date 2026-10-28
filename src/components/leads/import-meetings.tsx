"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Download, Upload, X } from "lucide-react";
import { Button, readApiError } from "@/components/ui";
import { MEETING_IMPORT_COLUMNS } from "@/lib/lead-sources";

// "Import meetings (CSV)": the meetings booked before the show, one row each
// with the brief, become leads (or update the ones already there). One bad row
// and nothing is imported: the rows to fix are listed by their number.

interface RowError {
  row: number;
  message: string;
}

export interface ImportCounts {
  created: number;
  updated: number;
}

export function ImportMeetingsButton({ onImported }: { onImported: (counts: ImportCounts) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; rows: RowError[] } | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setFailure(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/leads/import", { method: "POST", body });
      if (!res.ok) {
        const clone = res.clone();
        const rows = ((await res.json().catch(() => null)) as { error?: { rows?: RowError[] } } | null)?.error?.rows ?? [];
        setFailure({ message: await readApiError(clone, "The meetings couldn't be imported."), rows });
        return;
      }
      onImported((await res.json()) as ImportCounts);
    } catch {
      setFailure({ message: "The meetings couldn't be imported. Check the connection and try again.", rows: [] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" busy={busy} onClick={() => inputRef.current?.click()}>
        {busy ? null : <Upload size={15} aria-hidden />}
        Import meetings (CSV)
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      {failure ? (
        <ImportProblems
          failure={failure}
          onRetry={() => {
            setFailure(null);
            inputRef.current?.click();
          }}
          onClose={() => setFailure(null)}
        />
      ) : null}
    </>
  );
}

function ImportProblems({ failure, onRetry, onClose }: { failure: { message: string; rows: RowError[] }; onRetry: () => void; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex animate-fade-in items-end justify-center bg-ink/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-card sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <AlertTriangle size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              Nothing was imported
            </h2>
            <p className="text-xs text-muted">{failure.rows.length ? "Fix these rows and import the file again." : failure.message}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition-colors duration-150 hover:bg-canvas hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {failure.rows.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Rows to fix">
              {failure.rows.map((r, i) => (
                <li key={`${r.row}-${i}`} className="flex gap-3 px-3 py-2 text-sm">
                  <span className="w-14 shrink-0 font-medium tabular-nums text-ink">
                    Row <span className="tabular-nums">{r.row}</span>
                  </span>
                  <span className="min-w-0 text-ink [overflow-wrap:anywhere]">{r.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs leading-relaxed text-muted">
            One row per meeting, after a header row with these columns: <span className="font-medium text-ink">{MEETING_IMPORT_COLUMNS.join(", ")}</span>. Only
            customerName and companyName are needed. meetingAt is Istanbul time, as <span className="tabular-nums">2026-11-02 14:30</span>. Importing the same
            list again updates those leads.
          </p>
          <a
            href="/api/leads/import"
            download="caretrail-meetings-template.csv"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            <Download size={14} aria-hidden />
            Download a template
          </a>
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onRetry}>
            <Upload size={15} aria-hidden />
            Choose the file again
          </Button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
