"use client";

import { useState } from "react";
import { FileDown, Languages } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import { LANGUAGE_NAMES } from "@/lib/intake/language";

const RTL = new Set(["ar", "fa", "ur", "he"]);

/**
 * A received document in another language: the English translation first,
 * the original a click away (right to left for Arabic), and the translation
 * as a PDF for the case file.
 */
export function TranslationCard({
  documentId,
  language,
  ocr,
  original,
  english,
}: {
  documentId: string;
  language: string;
  ocr: boolean;
  original: string | null;
  english: string;
}) {
  const [view, setView] = useState<"english" | "original">("english");
  const name = LANGUAGE_NAMES[language] ?? language.toUpperCase();
  const showOriginal = view === "original" && Boolean(original);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>Translation</SectionTitle>
        <a
          href={`/api/documents/${documentId}/translation`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors duration-150 hover:border-brand/40 hover:text-brand"
        >
          <FileDown size={15} aria-hidden /> English PDF
        </a>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
        <Languages size={14} aria-hidden />
        <span>
          {name}
          {ocr ? " (scanned, read with OCR)" : ""} → English
        </span>
      </p>
      {original ? (
        <div role="tablist" aria-label="Translation" className="mt-3 inline-flex rounded-xl bg-canvas p-1 ring-1 ring-line">
          {(
            [
              ["english", "English"],
              ["original", `Original (${name})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${view === id ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <div
        dir={showOriginal && RTL.has(language) ? "rtl" : "ltr"}
        lang={showOriginal ? language : "en"}
        translate="no"
        className="mt-3 max-h-[380px] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-canvas p-4 text-sm leading-relaxed text-ink"
      >
        {showOriginal ? original : english}
      </div>
      <p className="mt-2 text-xs text-muted">Machine translation for handling the case: names, dates and amounts are kept as written. A certified translation can be ordered when one is needed.</p>
    </Card>
  );
}
