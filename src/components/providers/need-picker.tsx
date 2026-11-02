"use client";

import { Activity, Baby, Bone, Brain, Ear, Eye, HeartPulse, Smile, Sparkles, Stethoscope, Syringe, Thermometer, Video, type LucideIcon } from "lucide-react";
import { CARE_NEEDS } from "@/lib/services/provider-needs";

const ICONS: Record<string, LucideIcon> = {
  urgent: Thermometer,
  gp: Stethoscope,
  emergency: Activity,
  ortho: Bone,
  cardio: HeartPulse,
  gastro: Syringe,
  derm: Sparkles,
  neuro: Brain,
  ent: Ear,
  eye: Eye,
  gyn: Baby,
  peds: Baby,
  dental: Smile,
  video: Video,
};

/** What the patient needs, as icon chips. */
export function NeedPicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What the patient needs">
      {CARE_NEEDS.map((n) => {
        const Icon = ICONS[n.id] ?? Syringe;
        const on = value === n.id;
        return (
          <button
            key={n.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={n.label}
            disabled={disabled}
            onClick={() => onChange(n.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
              on ? "border-brand bg-brand bg-brand-gradient text-white shadow-glow" : "border-line bg-surface text-ink hover:border-brand/40"
            }`}
          >
            <Icon size={13} aria-hidden /> {n.short}
          </button>
        );
      })}
    </div>
  );
}
