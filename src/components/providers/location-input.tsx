"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Building2, MapPin, Navigation, Plane } from "lucide-react";
import { CARE_LOCATIONS, type CareLocation } from "@/lib/services/provider-needs";

// ---------------------------------------------------------------------------
// Where the patient is: a combobox over the places the demo knows (Istanbul's
// districts, hotels and airports, a few abroad), plus "where the case's
// patient is" when the search is opened from a case. The chosen place's
// coordinates travel with the search.
// ---------------------------------------------------------------------------

export interface PickedLocation {
  label: string;
  lat?: number;
  lng?: number;
  /** The search starts from the case's own location. */
  fromCase?: boolean;
}

const fieldClass =
  "w-full rounded-lg border border-line bg-surface py-2 pe-3 ps-9 text-sm text-ink transition-shadow focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:opacity-60";

export function LocationInput({ value, onChange, fromCase, disabled }: { value: string; onChange: (p: PickedLocation) => void; fromCase?: { label: string } | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const items = useMemo(() => {
    const q = value.trim().toLowerCase();
    const matches = (l: CareLocation) => !q || l.label.toLowerCase().includes(q) || l.city.toLowerCase().includes(q);
    const list: { key: string; primary: string; secondary?: string; icon: "case" | "district" | "place"; run: () => void }[] = [];
    if (fromCase && (!q || fromCase.label.toLowerCase().includes(q) || "case".includes(q))) {
      list.push({ key: "case", primary: fromCase.label, secondary: "where the case's patient is", icon: "case", run: () => onChange({ label: fromCase.label, fromCase: true }) });
    }
    for (const l of CARE_LOCATIONS.filter(matches)) {
      list.push({ key: l.id, primary: l.label, secondary: l.kind === "district" ? "district" : l.city, icon: l.kind, run: () => onChange({ label: l.label, lat: l.lat, lng: l.lng }) });
    }
    return list.slice(0, 14);
  }, [value, fromCase, onChange]);

  return (
    <div ref={box} className="relative">
      <MapPin size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange({ label: e.target.value });
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + items.length) % items.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            items[active]?.run();
            setOpen(false);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="District, hotel or airport"
        className={fieldClass}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {open && items.length ? (
        <ul id={listId} className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-card-hover" role="listbox">
          {items.map((it, i) => {
            const Icon = it.icon === "case" ? Navigation : it.icon === "district" ? MapPin : it.primary.includes("Airport") ? Plane : Building2;
            return (
              <li key={it.key} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    it.run();
                    setOpen(false);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-start text-sm ${i === active ? "bg-brand/10 text-brand" : "text-ink hover:bg-canvas"}`}
                >
                  <Icon size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate">{it.primary}</span>
                    {it.secondary ? <span className="block truncate text-xs text-muted">{it.secondary}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
