"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * A quiet "Delete" link that asks once before it acts, e.g. to remove a
 * visitor's own document after a meeting.
 */
export function ConfirmDelete({
  label,
  question,
  onConfirm,
}: {
  label: string;
  question: string;
  /** Resolves when done; throws (with a message) when it failed. */
  onConfirm: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setAsking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "It couldn't be deleted.");
    } finally {
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-red-700"
      >
        <Trash2 size={13} aria-hidden />
        {label}
      </button>
    );
  }
  return (
    <div className="w-full rounded-lg border border-red-200 bg-red-50 p-3" role="alertdialog" aria-label={label}>
      <p className="text-sm text-red-800">{question}</p>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        <Button variant="danger" busy={busy} onClick={() => void confirm()}>
          {label}
        </Button>
        <Button variant="secondary" onClick={() => setAsking(false)}>
          Keep it
        </Button>
      </div>
    </div>
  );
}
