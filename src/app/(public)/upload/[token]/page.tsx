"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileUp, UploadCloud } from "lucide-react";
import { Button, Card, ErrorBanner } from "@/components/ui";
import { BrandMark } from "@/components/brand";

interface PublicClaim {
  ref: string;
  status: string;
  firstName: string;
  missing: string[];
}

/** Claimant-facing upload page behind a signed link (no sign-in). */
export default function ClaimUploadPage({ params }: { params: { token: string } }) {
  const [claim, setClaim] = useState<PublicClaim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const api = `/api/public/upload/${encodeURIComponent(params.token)}`;

  useEffect(() => {
    fetch(api)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error?.message ?? "This link can't be opened.");
        setClaim(body.claim);
      })
      .catch((e: Error) => setError(e.message));
  }, [api]);

  async function upload() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const res = await fetch(api, { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "The upload failed. Please try again.");
      setClaim(body.claim);
      setFiles([]);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card className="p-7">
        <div className="mb-5 flex items-center gap-3">
          <BrandMark size={34} />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Send your claim documents</h1>
            <p className="text-xs text-slate-500">Secure upload</p>
          </div>
        </div>
        {error ? <ErrorBanner message={error} /> : null}
        {claim ? (
          <>
            <p className="text-sm text-slate-700">
              Hello {claim.firstName}, this link adds documents to claim <span className="font-semibold">{claim.ref}</span>.
            </p>
            {claim.missing.length ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Still needed</p>
                <ul className="mt-1.5 list-disc pl-5 text-sm text-amber-900">
                  {claim.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircle2 size={16} aria-hidden /> Nothing is missing — your claim is with the claims team.
              </p>
            )}
            {done ? (
              <p className="mt-4 text-sm text-emerald-700">Thank you — your documents were received and checked.</p>
            ) : null}
            <div className="mt-5 space-y-3">
              <input
                ref={input}
                type="file"
                multiple
                accept="application/pdf,text/plain"
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              <Button variant="secondary" onClick={() => input.current?.click()} className="w-full">
                <FileUp size={15} aria-hidden />
                {files.length ? `${files.length} document(s) selected` : "Choose PDF documents"}
              </Button>
              {files.length ? <p className="text-xs text-slate-500">{files.map((f) => f.name).join(" · ")}</p> : null}
              <Button onClick={upload} busy={busy} disabled={!files.length} className="w-full">
                <UploadCloud size={15} aria-hidden /> Upload
              </Button>
            </div>
          </>
        ) : !error ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : null}
      </Card>
    </div>
  );
}
