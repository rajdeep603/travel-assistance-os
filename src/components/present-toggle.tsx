"use client";

import { useEffect, useState } from "react";
import { Presentation } from "lucide-react";
import { PRESENT_EVENT, setPresentMode } from "@/lib/present-mode";
import { T } from "@/components/i18n";

/**
 * Toggles presentation mode: a root font-size bump that scales the whole UI
 * for projectors and big booth screens. Persisted per browser.
 */
export function PresentToggle() {
  const [on, setOn] = useState(false);

  // The root layout applies the saved mode before paint; mirror it here, and
  // follow changes made elsewhere (the command palette).
  useEffect(() => {
    setOn(document.documentElement.dataset.present === "on");
    const follow = (e: Event) => setOn(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(PRESENT_EVENT, follow);
    return () => window.removeEventListener(PRESENT_EVENT, follow);
  }, []);

  function toggle() {
    setPresentMode(!on);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      title="Presentation mode — larger text for projectors"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        on
          ? "border-brand bg-brand bg-brand-gradient text-white shadow-glow"
          : "border-line bg-surface text-muted hover:border-brand/50 hover:text-brand"
      }`}
    >
      <Presentation size={13} aria-hidden />
      <span className="hidden sm:inline"><T>Present</T></span>
    </button>
  );
}
