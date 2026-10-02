"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, UploadCloud } from "lucide-react";
import {
  Card,
  ConfidenceBar,
  EmptyState,
  ErrorBanner,
  KeyValue,
  PageHeader,
  SectionTitle,
  StatusBadge,
  readApiError,
} from "@/components/ui";
import { AIPipeline } from "@/components/ai-progress";
import { formatEnum } from "@/lib/format";

/** "medical-report-aylin-yilmaz.pdf" → "Medical report — Aylin Yilmaz" */
function sampleLabel(filename: string): string {
  const base = filename.replace(/\.pdf$/i, "");
  const m = base.match(
    /^(medical-report|hospital-invoice|discharge-summary|emergency-report|prescription)-(.+)$/
  );
  if (!m) return base.replace(/-/g, " ");
  const name = m[2]
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return `${formatEnum(m[1].replace(/-/g, "_"))} — ${name}`;
}

const PIPELINE_STAGES = [
  "Reading the PDF",
  "Classifying the document",
  "Extracting structured fields",
  "Checking for missing information",
];

interface Extraction {
  patientName: string | null;
  dateOfBirth: string | null;
  hospital: string | null;
  doctor: string | null;
  diagnosis: string | null;
  symptoms: string[];
  admissionDate: string | null;
  dischargeDate: string | null;
  procedures: string[];
  medications: string[];
  invoiceAmount: number | null;
  currency: string | null;
  policyReference: string | null;
  summary: string | null;
  missingInfo: string[];
  confidence: number | null;
}

interface Doc {
  id: string;
  filename: string;
  kind: string;
  status: string;
  storagePath: string | null;
  textContent: string | null;
  error: string | null;
  createdAt: string;
  extraction: Extraction | null;
}

export default function DocumentsPage() {
  const [samples, setSamples] = useState<string[]>([]);
  const [recent, setRecent] = useState<Doc[]>([]);
  const [current, setCurrent] = useState<Doc | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const body = await res.json();
        setRecent(body.documents ?? []);
      }
    } catch {
      // list is non-critical; upload flow surfaces its own errors
    }
  }, []);

  useEffect(() => {
    fetch("/api/documents/sample")
      .then((r) => (r.ok ? r.json() : { samples: [] }))
      .then((b) => setSamples(b.samples ?? []))
      .catch(() => setSamples([]));
    loadRecent();
  }, [loadRecent]);

  async function handleUpload(file: File) {
    setError(null);
    setCurrent(null);
    setProcessing(`Processing “${file.name}”…`);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          body?.error?.message ?? "The document could not be processed. Please try again."
        );
        if (body?.document) setCurrent(body.document);
        return;
      }
      setCurrent(body.document);
      loadRecent();
    } catch {
      setError("Upload failed — please check your connection and try again.");
    } finally {
      setProcessing(null);
    }
  }

  async function handleSample(file: string) {
    setError(null);
    setCurrent(null);
    setProcessing(`Processing “${sampleLabel(file)}”…`);
    try {
      const res = await fetch("/api/documents/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The sample document could not be processed."));
        return;
      }
      const body = await res.json();
      setCurrent(body.document);
      loadRecent();
    } catch {
      setError("Processing failed — please check your connection and try again.");
    } finally {
      setProcessing(null);
    }
  }

  const e = current?.extraction ?? null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Medical Document AI"
        subtitle="Upload a medical PDF — the pipeline runs text extraction, AI classification and structured extraction, then flags missing information."
      />
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left: upload + viewer */}
        <div className="space-y-5">
          <Card>
            <SectionTitle>Upload document</SectionTitle>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="mt-3 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-slate-500 transition-all hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600"
            >
              <UploadCloud size={28} />
              <span className="text-sm font-medium">
                Click to choose a PDF (max 10 MB)
              </span>
              <span className="text-xs text-slate-400">
                PDF or plain text · processed immediately
              </span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,text/plain"
              className="hidden"
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                if (f) handleUpload(f);
                ev.target.value = "";
              }}
            />
            <div className="mt-4">
              <SectionTitle>Or use a fictional sample document</SectionTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                {samples.length === 0 ? (
                  <p className="text-xs text-slate-400">No sample documents found.</p>
                ) : (
                  samples.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSample(s)}
                      disabled={processing != null}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                    >
                      {sampleLabel(s)}
                    </button>
                  ))
                )}
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle>Document viewer</SectionTitle>
            {current?.storagePath?.startsWith("demo-documents/") ? (
              <iframe
                title="Document preview"
                src={`/${current.storagePath}`}
                className="mt-3 h-[430px] w-full rounded-lg border border-slate-200"
              />
            ) : current?.textContent ? (
              <div className="mt-3">
                <p className="mb-2 text-xs text-slate-400">
                  Text extracted from the uploaded document:
                </p>
                <pre className="h-[400px] w-full overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
                  {current.textContent}
                </pre>
              </div>
            ) : (
              <div className="mt-3">
                <EmptyState
                  title="No document selected"
                  hint="Upload a PDF or pick a sample to see it here."
                />
              </div>
            )}
          </Card>
        </div>

        {/* Right: extraction results */}
        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between">
              <SectionTitle>Structured extraction</SectionTitle>
              {current ? <StatusBadge value={current.status} /> : null}
            </div>
            {processing ? (
              <div className="mt-4">
                <p className="mb-3 text-sm text-slate-500">{processing}</p>
                <AIPipeline busy stages={PIPELINE_STAGES} />
              </div>
            ) : current?.status === "FAILED" ? (
              <div className="mt-4">
                <ErrorBanner
                  message={current.error ?? "Processing failed for this document."}
                />
              </div>
            ) : e ? (
              <dl className="animate-fade-up mt-2 grid grid-cols-2 gap-x-4">
                <KeyValue label="Patient name" value={e.patientName} />
                <KeyValue label="Date of birth" value={e.dateOfBirth} />
                <KeyValue label="Hospital" value={e.hospital} />
                <KeyValue label="Doctor" value={e.doctor} />
                <KeyValue label="Diagnosis" value={e.diagnosis} />
                <KeyValue
                  label="Symptoms"
                  value={e.symptoms.length ? e.symptoms.join(", ") : null}
                />
                <KeyValue label="Admission date" value={e.admissionDate} />
                <KeyValue label="Discharge date" value={e.dischargeDate} />
                <KeyValue
                  label="Procedures"
                  value={e.procedures.length ? e.procedures.join(", ") : null}
                />
                <KeyValue
                  label="Medications"
                  value={e.medications.length ? e.medications.join(", ") : null}
                />
                <KeyValue
                  label="Invoice amount"
                  value={
                    e.invoiceAmount != null
                      ? `${Number(e.invoiceAmount).toLocaleString()} ${e.currency ?? ""}`
                      : null
                  }
                />
                <KeyValue label="Policy / claim reference" value={e.policyReference} />
                <KeyValue
                  label="Document type"
                  value={current ? formatEnum(current.kind) : null}
                />
              </dl>
            ) : (
              <div className="mt-4">
                <EmptyState
                  title="No extraction yet"
                  hint="Process a document to see the structured fields."
                />
              </div>
            )}
          </Card>

          {e?.confidence != null ? (
            <Card className="animate-fade-up" style={{ animationDelay: "70ms" }}>
              <ConfidenceBar value={e.confidence} />
            </Card>
          ) : null}

          {e?.summary ? (
            <Card className="animate-fade-up" style={{ animationDelay: "140ms" }}>
              <SectionTitle>AI summary</SectionTitle>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{e.summary}</p>
            </Card>
          ) : null}

          {e ? (
            <Card className="animate-fade-up" style={{ animationDelay: "210ms" }}>
              <SectionTitle>Missing information</SectionTitle>
              {e.missingInfo.length === 0 ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle2 size={16} /> Nothing missing — document looks complete.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {e.missingInfo.map((m) => (
                    <li
                      key={m}
                      className="flex items-start gap-2 text-sm text-amber-700"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-5">
        <SectionTitle>Recently processed documents</SectionTitle>
        {recent.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No documents processed yet" />
          </div>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {recent.slice(0, 8).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setCurrent(d);
                  setError(null);
                }}
                className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                  <FileText size={15} className="shrink-0 text-slate-400" />
                  <span className="truncate">{d.filename}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs text-slate-400 sm:inline">
                    {formatEnum(d.kind)}
                  </span>
                  <StatusBadge value={d.status} />
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
