"use client";

import { useId, useState } from "react";
import { ChevronDown, Download, ExternalLink, FileText, Mail, MessageSquareText } from "lucide-react";
import { fileName, fileType, kitsFor, type SampleSection } from "@/lib/samples/catalog";

const ICONS: Record<string, typeof FileText> = { PDF: FileText, EML: Mail, TXT: MessageSquareText };

/**
 * The fictional sample files for one screen, ready to download and feed back
 * in through the screen's own upload. Collapsed to one line until opened.
 */
export function SampleFiles({ section, className = "" }: { section: SampleSection; className?: string }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const kits = kitsFor(section);
  const count = new Set(kits.flatMap((k) => k.files.map((f) => f.path))).size;
  if (kits.length === 0) return null;

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-deep"
      >
        <Download size={15} aria-hidden />
        Sample files to download
        <span className="font-normal tabular-nums text-muted">({count})</span>
        <ChevronDown size={15} aria-hidden className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div id={panel} className="mt-3 animate-fade-up space-y-3">
          {kits.map((kit) => (
            <section key={kit.id} aria-label={kit.title} className="rounded-lg border border-line bg-canvas p-3">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-ink">{kit.title}</h3>
                  <p className="text-xs leading-relaxed text-muted">{kit.description}</p>
                </div>
                {kit.files.length > 1 ? (
                  <a
                    href={`/api/samples/${kit.id}`}
                    download
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand hover:text-brand-deep hover:underline"
                  >
                    <Download size={13} aria-hidden /> All as .zip
                  </a>
                ) : null}
              </div>
              <ul className="mt-2 divide-y divide-line">
                {kit.files.map((f) => {
                  const type = fileType(f.path);
                  const Icon = ICONS[type] ?? FileText;
                  return (
                    <li key={f.path} className="flex items-center gap-3 py-2">
                      <Icon size={16} aria-hidden className="shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink [overflow-wrap:anywhere]">
                          {f.title}
                          <span className="ml-2 rounded border border-line bg-surface px-1 py-px align-middle text-[10px] font-medium tabular-nums text-muted">
                            {type}
                          </span>
                        </p>
                        <p className="text-xs leading-relaxed text-muted [overflow-wrap:anywhere]">{f.note}</p>
                      </div>
                      {type === "PDF" ? (
                        <a
                          href={`/${f.path}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${f.title}`}
                          title="Open in a new tab"
                          className="rounded-md p-1.5 text-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
                        >
                          <ExternalLink size={14} aria-hidden />
                        </a>
                      ) : null}
                      <a
                        href={`/${f.path}`}
                        download={fileName(f.path)}
                        aria-label={`Download ${f.title} (${fileName(f.path)})`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink transition-colors duration-150 hover:border-brand hover:text-brand"
                      >
                        <Download size={13} aria-hidden /> Download
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
