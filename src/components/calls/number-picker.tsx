"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, readApiError } from "@/components/ui";
import type { ApprovedNumberEntry } from "@/lib/services/approved-numbers";

export type NumberEntry = ApprovedNumberEntry;

const fieldClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none";

/**
 * The number an AI agent will call: one of the approved numbers, or a new one
 * typed with its country code (a prospect's own mobile at the booth), which
 * is approved on the spot and offered everywhere numbers are picked. Numbers
 * added here can be removed again; configured ones can't.
 */
export function NumberPicker({
  label = "Number to call",
  value,
  onChange,
  numbers,
  onNumbers,
  suggested,
  disabled,
}: {
  label?: string;
  value: string;
  onChange: (number: string) => void;
  numbers: NumberEntry[];
  /** The approved list changed (a number added or removed). */
  onNumbers: (numbers: NumberEntry[]) => void;
  /** A number from the record (the hospital's, the patient's), tagged in the list. */
  suggested?: { number: string; tag: string } | null;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = numbers.find((n) => n.number === value) ?? null;

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/calls/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: draft, label: draftLabel || undefined }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The number couldn't be added."));
        return;
      }
      const body = (await res.json()) as { number: NumberEntry; numbers: NumberEntry[] };
      onNumbers(body.numbers);
      onChange(body.number.number);
      setDraft("");
      setDraftLabel("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: NumberEntry) {
    if (!entry.id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/calls/numbers?id=${encodeURIComponent(entry.id)}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res, "The number couldn't be removed."));
        return;
      }
      const body = (await res.json()) as { numbers: NumberEntry[] };
      onNumbers(body.numbers);
      if (value === entry.number) onChange(body.numbers[0]?.number ?? "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || numbers.length === 0} className={fieldClass}>
          {numbers.length === 0 ? <option value="">No approved numbers yet</option> : null}
          {numbers.map((n) => (
            <option key={n.number} value={n.number}>
              {n.number}
              {n.label ? ` · ${n.label}` : ""}
              {suggested && n.number === suggested.number ? ` (${suggested.tag})` : ""}
            </option>
          ))}
        </select>
      </label>
      {adding ? (
        <div className="rounded-lg border border-line bg-canvas/60 p-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <input
              type="tel"
              inputMode="tel"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
              placeholder="+90 532 123 45 67"
              aria-label="Number with country code"
              className={fieldClass}
            />
            <input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
              placeholder="Who it is, e.g. Client at the booth"
              aria-label="Label"
              className={fieldClass}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">With the country code (+90, +44, +91…). Only numbers on this list can be called; remove it when you&apos;re done.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button busy={busy} disabled={!draft.trim()} onClick={() => void add()}>
              <Plus size={14} aria-hidden /> Approve and use
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <button type="button" disabled={disabled} onClick={() => setAdding(true)} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline disabled:opacity-60">
            <Plus size={13} aria-hidden /> Add a number
          </button>
          {selected?.id ? (
            <button type="button" disabled={busy || disabled} onClick={() => void remove(selected)} className="inline-flex items-center gap-1 text-muted hover:text-red-700 disabled:opacity-60">
              <X size={13} aria-hidden /> Remove {selected.number}
            </button>
          ) : null}
        </div>
      )}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
