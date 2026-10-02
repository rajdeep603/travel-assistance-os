"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, UploadCloud } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  SectionTitle,
  SkeletonRows,
  StatusBadge,
  readApiError,
} from "@/components/ui";
import { AIPipeline } from "@/components/ai-progress";
import { formatMoney } from "@/lib/format";

const CLAIM_STAGES = [
  "Reading the documents",
  "Classifying each document",
  "Extracting the claim data",
  "Checking completeness",
  "Preparing for human review",
];

interface ClaimRow {
  id: string;
  ref: string;
  status: string;
  amount: number | null;
  currency: string | null;
  summary: string | null;
  createdAt: string;
  patient: { firstName: string; lastName: string };
  case: { ref: string } | null;
  documents: { id: string }[];
}

interface PatientOption {
  id: string;
  ref: string;
  firstName: string;
  lastName: string;
}

export default function ClaimsPage() {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [claimsRes, patientsRes] = await Promise.all([
        fetch("/api/claims"),
        fetch("/api/patients"),
      ]);
      if (claimsRes.ok) setClaims((await claimsRes.json()).claims ?? []);
      if (patientsRes.ok) setPatients((await patientsRes.json()).patients ?? []);
    } catch {
      setError("The claims list could not be loaded — please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitSamplePack() {
    setError(null);
    setNotice(null);
    setUploading(true);
    try {
      const res = await fetch("/api/claims/sample", { method: "POST" });
      if (!res.ok) {
        setError(await readApiError(res, "The sample claim could not be created."));
        return;
      }
      const body = await res.json();
      const warn = body.warnings?.length ? ` (${body.warnings.join(" ")})` : "";
      setNotice(`Claim ${body.claim.ref} created from the sample pack and analysed${warn}.`);
      load();
    } catch {
      setError("The sample claim could not be created — please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function submitClaim() {
    setError(null);
    setNotice(null);
    if (!patientId) {
      setError("Please select the patient this claim belongs to.");
      return;
    }
    if (files.length === 0) {
      setError("Please add at least one claim document (PDF).");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("patientId", patientId);
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/claims/upload", { method: "POST", body: form });
      if (!res.ok) {
        setError(await readApiError(res, "The claim could not be created."));
        return;
      }
      const body = await res.json();
      const warn = body.warnings?.length ? ` (${body.warnings.join(" ")})` : "";
      setNotice(`Claim ${body.claim.ref} created and analysed${warn}.`);
      setFiles([]);
      load();
    } catch {
      setError("Claim upload failed — please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Claims Automation"
        subtitle="Upload claim documents — AI classifies them, extracts the claim data, checks completeness and prepares the claim for human review."
      />
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <Card className="mb-5">
        <SectionTitle>New claim from documents</SectionTitle>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select patient…</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ref} — {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            <UploadCloud size={15} />
            {files.length > 0 ? `${files.length} document(s) selected` : "Choose documents"}
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="application/pdf,text/plain"
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <Button onClick={submitClaim} busy={uploading && files.length > 0}>
            Create &amp; analyse claim
          </Button>
          <span className="text-xs text-slate-400">or</span>
          <Button
            variant="secondary"
            onClick={submitSamplePack}
            busy={uploading && files.length === 0}
            disabled={uploading}
          >
            <Sparkles size={15} aria-hidden />
            Use sample claim pack
          </Button>
        </div>
        {uploading ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <AIPipeline busy stages={CLAIM_STAGES} />
          </div>
        ) : null}
        {files.length > 0 ? (
          <p className="mt-2 text-xs text-slate-400">
            {files.map((f) => f.name).join(" · ")}
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-400">
            The sample pack files a fictional medical report, hospital invoice and
            discharge summary together — the full claims flow in one click.
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle>Claims</SectionTitle>
        {loading ? (
          <div className="mt-3"><SkeletonRows rows={6} /></div>
        ) : claims.length === 0 ? (
          <div className="mt-3"><EmptyState title="No claims yet" /></div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-semibold">Claim</th>
                  <th className="py-2 pr-4 font-semibold">Patient</th>
                  <th className="py-2 pr-4 font-semibold">Case</th>
                  <th className="py-2 pr-4 font-semibold">Amount</th>
                  <th className="py-2 pr-4 font-semibold">Documents</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-slate-50">
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/claims/${c.ref}`}
                        className="font-semibold text-blue-600 hover:underline"
                      >
                        {c.ref}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700">
                      {c.patient.firstName} {c.patient.lastName}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500">
                      {c.case ? (
                        <Link href={`/cases/${c.case.ref}`} className="text-blue-600 hover:underline">
                          {c.case.ref}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700">
                      {c.amount != null ? formatMoney(Number(c.amount), c.currency) : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500">{c.documents.length}</td>
                    <td className="py-2.5"><StatusBadge value={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
