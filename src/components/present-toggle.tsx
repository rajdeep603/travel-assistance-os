"use client";

import { useEffect, useState } from "react";
import { Presentation } from "lucide-react";

const STORAGE_KEY = "taap-presentation-mode";

/**
 * Toggles presentation mode: a root font-size bump that scales the whole UI
 * for projectors and big booth screens. Persisted per browser.
 */
export function PresentToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "on") {
        setOn(true);
        document.documentElement.dataset.present = "on";
      }
    } catch {
      // storage unavailable (private mode) — toggle still works per page
    }
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    if (next) document.documentElement.dataset.present = "on";
    else delete document.documentElement.dataset.present;
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // non-critical
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      title="Presentation mode — larger text for projectors"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
        on
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-300 bg-white text-slate-500 hover:border-blue-400 hover:text-blue-600"
      }`}
    >
      <Presentation size={13} aria-hidden />
      <span className="hidden sm:inline">Present</span>
    </button>
  );
}
