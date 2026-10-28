"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Camera, Info, Loader2, ScanLine, X } from "lucide-react";
import { AISourceBadge, Button, readApiError } from "@/components/ui";
import { shrinkImage } from "@/lib/client/shrink-image";

// "Scan a business card": on the iPad the button opens the camera, on a
// laptop it picks a photo. The model reads the card into a small form the
// presenter checks, and saving it opens the lead (the one with the same
// e-mail address, if there is one). The photo is never stored.

interface Draft {
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  website: string;
}

const EMPTY: Draft = { name: "", company: "", role: "", email: "", phone: "", website: "" };

// The website stays a text field: cards print "www.…" without the https:// a URL field insists on.
const FIELDS: { key: keyof Draft; label: string; type?: string; inputMode?: "url"; autoComplete: string; required?: boolean }[] = [
  { key: "name", label: "Name", autoComplete: "name", required: true },
  { key: "company", label: "Company", autoComplete: "organization", required: true },
  { key: "role", label: "Job title", autoComplete: "organization-title" },
  { key: "email", label: "E-mail", type: "email", autoComplete: "email" },
  { key: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
  { key: "website", label: "Website", inputMode: "url", autoComplete: "url" },
];

// 16 px on touch screens, so the iPad doesn't zoom into the field.
const FIELD =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:bg-canvas disabled:text-muted [@media(hover:none)]:text-base";

export function ScanCardButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);

  return (
    <>
      <Button variant="secondary" onClick={() => inputRef.current?.click()}>
        <ScanLine size={15} aria-hidden />
        Scan a business card
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared, so the same photo can be chosen again.
          e.target.value = "";
          if (file) setPhoto(file);
        }}
      />
      {photo ? <CardDialog key={`${photo.name}-${photo.lastModified}-${photo.size}`} photo={photo} onRetake={() => inputRef.current?.click()} onClose={() => setPhoto(null)} /> : null}
    </>
  );
}

function CardDialog({ photo, onRetake, onClose }: { photo: File; onRetake: () => void; onClose: () => void }) {
  const router = useRouter();
  const titleId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [reading, setReading] = useState(true);
  const [source, setSource] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const body = new FormData();
        body.append("file", await shrinkImage(photo), "card.jpg");
        const res = await fetch("/api/leads/card", { method: "POST", body });
        if (!res.ok) throw new Error(await readApiError(res, "The card couldn't be read. Type the details in."));
        const reading = (await res.json()) as { draft: Draft; source: string; note: string | null };
        if (!live) return;
        setDraft(reading.draft);
        setSource(reading.source === "claude" ? reading.source : null);
        setNote(reading.note);
      } catch (err) {
        if (live) setNote(err instanceof Error ? err.message : "The card couldn't be read. Type the details in.");
      } finally {
        if (live) setReading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [photo]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/leads/card/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      if (!res.ok) throw new Error(await readApiError(res, "The lead couldn't be saved."));
      const { lead } = (await res.json()) as { lead: { id: string } };
      router.push(`/leads/${lead.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lead couldn't be saved.");
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex animate-fade-in items-end justify-center bg-ink/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-card sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <ScanLine size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              Business card
            </h2>
            <p className="text-xs text-muted">Check what was read, then save it as a lead.</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition-colors duration-150 hover:bg-canvas hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <form onSubmit={(e) => void save(e)} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-24 w-36 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local photo, shown before upload
                  <img src={preview} alt="The card's photo" className="h-full w-full object-contain" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {reading ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-ai" role="status">
                    <Loader2 size={15} className="animate-spin" aria-hidden />
                    Reading the card…
                  </p>
                ) : source ? (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                    <AISourceBadge source={source} />
                    Read by AI: check it against the card.
                  </p>
                ) : null}
                <Button variant="secondary" onClick={onRetake} disabled={busy}>
                  <Camera size={15} aria-hidden />
                  Retake
                </Button>
              </div>
            </div>

            {note ? (
              <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/[0.08] px-3 py-2 text-sm text-ink" role="status">
                <Info size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                {note}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="block text-xs font-medium text-muted">
                  {f.label}
                  {f.required ? <span className="text-muted"> (needed)</span> : null}
                  <input
                    type={f.type ?? "text"}
                    inputMode={f.inputMode}
                    value={draft[f.key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    disabled={reading}
                    required={f.required}
                    autoComplete={f.autoComplete}
                    placeholder={reading ? "—" : undefined}
                    className={FIELD}
                  />
                </label>
              ))}
            </div>

            <p className="text-xs text-muted">A card isn&apos;t consent to e-mail: ask before you send anything, and tick it when you do.</p>
            {error ? (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" busy={busy} disabled={reading}>
              Save lead
            </Button>
          </footer>
        </form>
      </div>
    </div>,
    document.body
  );
}
