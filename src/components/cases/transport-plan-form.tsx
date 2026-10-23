"use client";

import { useState } from "react";
import { Plane } from "lucide-react";
import { Button, ErrorBanner, readApiError } from "@/components/ui";

const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

/**
 * The treating doctor's assessment typed in by a case manager (the medical
 * transport AI call fills the same fields): the rules pick the least intensive
 * safe way home and request quotes.
 */
export function TransportPlanForm({ caseId, onCreated }: { caseId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    diagnosis: "",
    fitToFly: true,
    fitFrom: "",
    mobility: "SEATED",
    oxygenLpm: 0,
    monitoring: "NONE",
    intensiveCare: false,
    escort: "NONE",
    destination: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : k === "oxygenLpm" ? Number(e.target.value) : e.target.value }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/transport`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, fitFrom: f.fitFrom || undefined, destination: f.destination || undefined }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "The plan couldn't be made."));
      setOpen(false);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The plan couldn't be made.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
        <Plane size={14} aria-hidden /> Or enter the doctor&apos;s assessment here
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-line/70 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted">Diagnosis</span>
          <input value={f.diagnosis} onChange={set("diagnosis")} className={field} placeholder="Tibial plateau fracture after surgery; DVT on anticoagulation" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Mobility</span>
          <select value={f.mobility} onChange={set("mobility")} className={field}>
            <option value="SEATED">Seated</option>
            <option value="WHEELCHAIR">Wheelchair</option>
            <option value="STRETCHER">Stretcher</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Escort</span>
          <select value={f.escort} onChange={set("escort")} className={field}>
            <option value="NONE">None</option>
            <option value="NURSE">Nurse</option>
            <option value="DOCTOR">Doctor</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Oxygen (L/min)</span>
          <input type="number" min={0} max={15} value={f.oxygenLpm} onChange={set("oxygenLpm")} className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Monitoring</span>
          <select value={f.monitoring} onChange={set("monitoring")} className={field}>
            <option value="NONE">None</option>
            <option value="BASIC">Basic</option>
            <option value="CONTINUOUS">Continuous</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Fit to fly from (optional)</span>
          <input value={f.fitFrom} onChange={set("fitFrom")} className={field} placeholder="Monday 2 November" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Home to</span>
          <input value={f.destination} onChange={set("destination")} className={field} placeholder="Dubai" />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink/85">
          <input type="checkbox" checked={f.fitToFly} onChange={set("fitToFly")} className="accent-brand" /> Fit to fly
        </label>
        <label className="flex items-center gap-2 text-sm text-ink/85">
          <input type="checkbox" checked={f.intensiveCare} onChange={set("intensiveCare")} className="accent-brand" /> Needs intensive care in flight
        </label>
      </div>
      {error ? <div className="mt-3"><ErrorBanner message={error} /></div> : null}
      <div className="mt-3 flex gap-2">
        <Button onClick={() => void submit()} busy={busy} disabled={f.diagnosis.trim().length < 3}>
          Plan the transport
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
