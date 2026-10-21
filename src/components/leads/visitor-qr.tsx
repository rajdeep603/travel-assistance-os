"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { printElement } from "@/lib/client/print";

// The booth's QR code: visitors scan it with their own phone and land on
// /meet, where they leave their details. Shown big on the presenter's screen
// and printable as a table card.

export function VisitorQr({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    setUrl(`${window.location.origin}/meet`);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  async function print() {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      await printElement(cardRef.current, `${BRAND.name}: visitor QR code`);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Visitor QR code" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px]">
      <div className="animate-modal-in w-full max-w-md">
        <div ref={cardRef} className="rounded-3xl bg-surface p-7 text-center shadow-2xl print:shadow-none">
          <div className="flex items-center justify-center gap-2.5">
            <BrandMark size={32} />
            <div className="text-left">
              <p className="text-base font-semibold leading-tight tracking-tight text-ink">{BRAND.name}</p>
              <p className="text-xs text-muted">{BRAND.tagline}</p>
            </div>
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink">Scan to get a recap and a quotation for your numbers</h2>
          <p className="mt-1 text-sm text-muted">Open your camera and point it at the code.</p>
          <div className="mx-auto mt-5 w-[260px] rounded-2xl border border-line bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- an SVG the server draws for this host */}
            <img src="/api/leads/qr" alt={`QR code for ${url}`} width={236} height={236} className="h-[236px] w-[236px]" />
          </div>
          <p className="mt-3 text-sm font-medium tabular-nums text-ink">{url.replace(/^https?:\/\//, "")}</p>
          <p className="mt-1 text-xs text-muted">{BRAND.poweredBy} · {BRAND.company}</p>
        </div>
        <div className="mt-3 flex justify-center gap-2 print:hidden">
          <Button variant="secondary" busy={busy} onClick={() => void print()}>
            {busy ? null : <Printer size={15} aria-hidden />}
            Print a table card
          </Button>
          <Button variant="secondary" onClick={onClose}>
            <X size={15} aria-hidden />
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
