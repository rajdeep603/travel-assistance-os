"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Mail, MessageSquare, QrCode, X } from "lucide-react";
import { Button, ErrorBanner, SectionTitle, readApiError } from "@/components/ui";

// ---------------------------------------------------------------------------
// The practice's personal price-list link: shown as a QR code on screen (the
// practice scans it), or sent by text message or e-mail. On the link it
// confirms its details and sends prices, typed or as an uploaded price list
// the AI reads.
// ---------------------------------------------------------------------------

const fieldClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none";

export function PriceLinkDialog({ providerRef, providerName, phone, email, onClose, onDone }: { providerRef: string; providerName: string; phone: string | null; email: string | null; onClose: () => void; onDone?: () => void }) {
  const [channel, setChannel] = useState<"none" | "sms" | "email">("none");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; token: string; sent: boolean; reason: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setTo(channel === "sms" ? (phone ?? "") : channel === "email" ? (email ?? "") : "");
  }, [channel, phone, email]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(providerRef)}/price-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, to: to || undefined }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The link could not be created."));
        return;
      }
      setResult(await res.json());
      onDone?.();
    } catch {
      setError("The link could not be created — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Price-list link" className="animate-modal-in w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <SectionTitle>Price-list link</SectionTitle>
            <p className="mt-1 text-sm text-muted">
              A personal link for <span className="font-semibold text-ink">{providerName}</span>: it confirms its details and sends its prices, typed in or as a price list the AI reads.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-canvas hover:text-ink" aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>

        {!result ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How to send it">
              {(
                [
                  { id: "none", label: "QR code on screen", icon: QrCode },
                  { id: "sms", label: "Text message", icon: MessageSquare },
                  { id: "email", label: "E-mail", icon: Mail },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={channel === c.id}
                  onClick={() => setChannel(c.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${channel === c.id ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand/40"}`}
                >
                  <c.icon size={13} aria-hidden /> {c.label}
                </button>
              ))}
            </div>
            {channel !== "none" ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">{channel === "sms" ? "Mobile number (with country code)" : "E-mail address"}</span>
                <input value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass} placeholder={channel === "sms" ? "+90 5xx xxx xx xx" : "front.desk@practice.example"} />
              </label>
            ) : (
              <p className="text-xs text-muted">The practice scans the code on your screen, or you copy the link into a message.</p>
            )}
            {error ? <ErrorBanner message={error} /> : null}
            <Button onClick={() => void create()} busy={busy} disabled={channel !== "none" && !to} className="w-full">
              <Link2 size={15} aria-hidden /> {channel === "none" ? "Create the link" : channel === "sms" ? "Send by text" : "Send by e-mail"}
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {result.sent ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
                Sent by {channel === "sms" ? "text message" : "e-mail"} to {to}.
              </p>
            ) : result.reason ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700" role="status">
                Not sent: {result.reason} The link below still works.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- an SVG from our own route */}
              <img src={`/api/providers/qr?token=${encodeURIComponent(result.token)}`} alt="QR code of the price-list link" width={160} height={160} className="rounded-xl border border-line bg-white p-2" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="break-all rounded-lg bg-canvas px-3 py-2 font-mono text-xs text-ink">{result.url}</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(result.url).then(() => setCopied(true));
                  }}
                >
                  <Copy size={13} aria-hidden /> {copied ? "Copied" : "Copy the link"}
                </Button>
                <a href={result.url} target="_blank" rel="noreferrer" className="block text-xs font-semibold text-brand hover:underline">
                  Open it as the practice would
                </a>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
