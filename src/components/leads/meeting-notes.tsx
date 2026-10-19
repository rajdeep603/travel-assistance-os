"use client";

import { useEffect, useState } from "react";
import { Check, Save } from "lucide-react";
import { Button, Card, SectionTitle, readApiError } from "@/components/ui";
import { LEAD_PAINS, LEAD_SEGMENTS } from "@/lib/meeting-notes";
import { PILOT_DAYS, PILOTS } from "@/lib/pilots";

// What the presenter heard in the meeting, kept on the lead: who they are,
// what hurts, the pilot that fits, and the next step. The follow-up e-mail is
// drafted from it.

export interface MeetingNotesValue {
  email: string | null;
  phone: string | null;
  segment: string | null;
  pains: string[];
  pilot: string | null;
  notes: string | null;
  nextStep: string | null;
  /** ISO date-time from the API; the form works with YYYY-MM-DD. */
  nextStepOn: string | null;
}

interface Form {
  email: string;
  phone: string;
  segment: string;
  pains: string[];
  pilot: string;
  notes: string;
  nextStep: string;
  nextStepOn: string;
}

const toForm = (v: MeetingNotesValue): Form => ({
  email: v.email ?? "",
  phone: v.phone ?? "",
  segment: v.segment ?? "",
  pains: v.pains,
  pilot: v.pilot ?? "",
  notes: v.notes ?? "",
  nextStep: v.nextStep ?? "",
  nextStepOn: v.nextStepOn?.slice(0, 10) ?? "",
});

const FIELD =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30";
const LABEL = "block text-xs font-medium text-muted";

export function MeetingNotes({
  leadId,
  value,
  onSaved,
}: {
  leadId: string;
  value: MeetingNotesValue;
  onSaved: (value: MeetingNotesValue) => void;
}) {
  const [form, setForm] = useState<Form>(() => toForm(value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(value));

  useEffect(() => {
    if (dirty) setSaved(false);
  }, [dirty]);

  const set = (change: Partial<Form>) => setForm((f) => ({ ...f, ...change }));
  const togglePain = (id: string) => set({ pains: form.pains.includes(id) ? form.pains.filter((p) => p !== id) : [...form.pains, id] });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = {
        email: form.email,
        phone: form.phone,
        segment: form.segment || null,
        pains: form.pains,
        pilot: form.pilot || null,
        notes: form.notes,
        nextStep: form.nextStep,
        nextStepOn: form.nextStepOn || null,
      };
      const res = await fetch(`/api/leads/${leadId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await readApiError(res, "The notes couldn't be saved."));
      const { lead } = (await res.json()) as { lead: MeetingNotesValue };
      onSaved(lead);
      setForm(toForm(lead));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The notes couldn't be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>Meeting notes</SectionTitle>
        {saved && !dirty ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-brand" role="status">
            <Check size={13} aria-hidden /> Saved
          </span>
        ) : null}
      </div>
      <form
        className="mt-3 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={LABEL}>
            E-mail
            <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@company.com" className={FIELD} />
          </label>
          <label className={LABEL}>
            Phone
            <input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={FIELD} />
          </label>
        </div>

        <label className={LABEL}>
          Who they are
          <select value={form.segment} onChange={(e) => set({ segment: e.target.value })} className={FIELD}>
            <option value="">Not noted</option>
            {LEAD_SEGMENTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className={LABEL}>What hurts most</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {LEAD_PAINS.map((p) => {
              const on = form.pains.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePain(p.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                    on ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink hover:bg-canvas"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className={LABEL}>
          Pilot that fits
          <select value={form.pilot} onChange={(e) => set({ pilot: e.target.value })} className={FIELD}>
            <option value="">None yet</option>
            {PILOTS.map((p) => (
              <option key={p.id} value={p.id}>
                {PILOT_DAYS} days: {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className={LABEL}>
          Notes
          <textarea
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            rows={4}
            maxLength={4000}
            placeholder="Volumes, systems they use, who decides, objections…"
            className={FIELD}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
          <label className={LABEL}>
            Next step
            <input value={form.nextStep} onChange={(e) => set({ nextStep: e.target.value })} maxLength={300} placeholder="e.g. Call with their COO" className={FIELD} />
          </label>
          <label className={LABEL}>
            By
            <input type="date" value={form.nextStepOn} onChange={(e) => set({ nextStepOn: e.target.value })} className={FIELD} />
          </label>
        </div>

        {error ? <p className="text-xs text-red-700">{error}</p> : null}
        <Button type="submit" busy={busy} disabled={!dirty}>
          {busy ? null : <Save size={15} aria-hidden />}
          Save notes
        </Button>
      </form>
    </Card>
  );
}
