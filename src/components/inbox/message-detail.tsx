"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, FileText, Languages, ScanLine, Send } from "lucide-react";
import { AISourceBadge, Button, Card, ErrorBanner, KeyValue, SectionTitle, SkeletonRows, StatusBadge, readApiError } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { formatDateTime, formatEnum } from "@/lib/format";

interface Doc {
  id: string;
  filename: string;
  kind: string;
  status: string;
  error: string | null;
  ocr: boolean;
  language: string | null;
  textContent: string | null;
  translatedText: string | null;
  storagePath: string | null;
  claim: { id: string; ref: string; status: string } | null;
  extraction: {
    patientName: string | null;
    dateOfBirth: string | null;
    hospital: string | null;
    diagnosis: string | null;
    policyReference: string | null;
    invoiceAmount: number | null;
    currency: string | null;
    confidence: number | null;
    aiSource: string | null;
  } | null;
}

interface Reply {
  id: string;
  channel: string;
  toAddress: string;
  subject: string | null;
  body: string;
  status: string;
  automatic: boolean;
  approvedBy: string | null;
  sentAt: string | null;
}

export interface MessageDetail {
  id: string;
  ref: string;
  channel: "EMAIL" | "FAX";
  fromAddress: string;
  toAddress: string | null;
  subject: string | null;
  bodyText: string | null;
  receivedAt: string;
  status: string;
  language: string | null;
  riskFlags: string[];
  summary: string | null;
  error: string | null;
  matchConfidence: number | null;
  matchReasons: { caseRef: string; score: number; reasons: string[] }[] | null;
  matchedCase: { id: string; ref: string; title: string; status: string } | null;
  documents: Doc[];
  replies: Reply[];
}

export function MessageDetailPanel({ id, onChanged, onDeleted }: { id: string; onChanged: () => void; onDeleted: () => void }) {
  const [m, setM] = useState<MessageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [caseRef, setCaseRef] = useState("");
  const [busy, setBusy] = useState<"reply" | "assign" | null>(null);
  const [showTranslation, setShowTranslation] = useState<Record<string, boolean>>({});

  const load = async () => {
    const res = await fetch(`/api/inbox/${id}`);
    if (!res.ok) {
      setError(await readApiError(res, "The message could not be loaded."));
      return;
    }
    const body = await res.json();
    setM(body.message);
    const pending = (body.message as MessageDetail).replies.find((r) => r.status === "QUEUED" && !r.automatic);
    setDraft(pending?.body ?? "");
  };

  useEffect(() => {
    setM(null);
    setError(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function post(path: string, body: unknown, kind: "reply" | "assign") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        setError(await readApiError(res, "That didn't work — please try again."));
        return;
      }
      await load();
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  if (error && !m) return <ErrorBanner message={error} />;
  if (!m) return <SkeletonRows rows={6} />;

  const pendingDraft = m.replies.find((r) => r.status === "QUEUED" && !r.automatic);
  const best = m.matchReasons?.[0];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">
              {m.ref} · {m.channel === "EMAIL" ? "E-mail" : "Fax"} · {formatDateTime(m.receivedAt)}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{m.subject ?? (m.channel === "FAX" ? "Incoming fax" : "(no subject)")}</h2>
            <p className="text-sm text-slate-600">From {m.fromAddress}</p>
          </div>
          <StatusBadge value={m.status} />
        </div>
        {m.summary ? <p className="mt-3 text-sm text-slate-700">{m.summary}</p> : null}
        <div className="mt-3">
          <ConfirmDelete
            key={m.id}
            label="Delete message"
            question="Delete this message with its attachments, what was read from them, replies and timeline entries? Use this for a visitor's own file after the meeting."
            onConfirm={async () => {
              const res = await fetch(`/api/inbox/${m.id}`, { method: "DELETE" });
              if (!res.ok) throw new Error(await readApiError(res, "The message couldn't be deleted."));
              onDeleted();
            }}
          />
        </div>
        {m.error ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> {m.error}
          </p>
        ) : null}
        {m.riskFlags.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {m.riskFlags.map((f) => (
              <span key={f} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                <AlertTriangle size={12} aria-hidden /> {f}
              </span>
            ))}
          </div>
        ) : null}
        {error ? (
          <div className="mt-3">
            <ErrorBanner message={error} />
          </div>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Case match</SectionTitle>
        {m.matchedCase ? (
          <p className="mt-2 text-sm">
            <Link href={`/cases/${m.matchedCase.id}`} className="font-semibold text-blue-600 hover:underline">
              {m.matchedCase.ref}
            </Link>{" "}
            <span className="text-slate-600">— {m.matchedCase.title}</span>
            {m.matchConfidence != null ? <span className="ml-2 text-xs text-slate-500">({Math.round(m.matchConfidence * 100)}% confidence)</span> : null}
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-600">No case matched with enough confidence.</p>
        )}
        {best?.reasons?.length ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
            {best.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
        {!m.matchedCase || (m.matchConfidence ?? 0) < 0.6 ? (
          <div className="mt-3 flex gap-2">
            <input
              value={caseRef}
              onChange={(e) => setCaseRef(e.target.value)}
              placeholder="CASE-1024"
              aria-label="Case reference to file this message on"
              className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <Button variant="secondary" busy={busy === "assign"} disabled={!caseRef.trim()} onClick={() => void post(`/api/inbox/${m.id}/assign`, { caseRef }, "assign")}>
              File on case
            </Button>
          </div>
        ) : null}
      </Card>

      {m.bodyText ? (
        <Card>
          <SectionTitle>Message{m.language && m.language !== "en" ? ` (${m.language.toUpperCase()})` : ""}</SectionTitle>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{m.bodyText}</pre>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Documents</SectionTitle>
        {m.documents.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No attachments.</p>
        ) : (
          <div className="mt-2 space-y-3">
            {m.documents.map((d) => (
              <div key={d.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <FileText size={14} className="text-slate-400" aria-hidden />
                    {d.filename}
                  </p>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {d.ocr ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                        <ScanLine size={11} aria-hidden /> OCR
                      </span>
                    ) : null}
                    {d.language && d.language !== "en" ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">{d.language.toUpperCase()}</span>
                    ) : null}
                    <span className="text-xs text-slate-500">{formatEnum(d.kind)}</span>
                    <StatusBadge value={d.status} />
                  </span>
                </div>
                {d.error ? <p className="mt-1 text-xs text-red-700">{d.error}</p> : null}
                {d.extraction ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4">
                    <KeyValue label="Patient" value={d.extraction.patientName} />
                    <KeyValue label="Date of birth" value={d.extraction.dateOfBirth} />
                    <KeyValue label="Hospital" value={d.extraction.hospital} />
                    <KeyValue label="Diagnosis" value={d.extraction.diagnosis} />
                    <KeyValue label="Policy" value={d.extraction.policyReference} />
                    <KeyValue
                      label="Amount"
                      value={d.extraction.invoiceAmount != null ? `${d.extraction.invoiceAmount.toLocaleString("en-GB")} ${d.extraction.currency ?? ""}` : null}
                    />
                  </dl>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {d.extraction ? <AISourceBadge source={d.extraction.aiSource} /> : null}
                  {d.storagePath ? (
                    <a
                      href={`/api/documents/${d.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                    >
                      <ExternalLink size={12} aria-hidden /> Open
                    </a>
                  ) : null}
                  {d.claim ? (
                    <Link href={`/claims/${d.claim.ref}`} className="text-xs font-medium text-blue-600 hover:underline">
                      Filed on {d.claim.ref}
                    </Link>
                  ) : null}
                  {d.translatedText ? (
                    <button
                      type="button"
                      onClick={() => setShowTranslation((s) => ({ ...s, [d.id]: !s[d.id] }))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                    >
                      <Languages size={12} aria-hidden /> {showTranslation[d.id] ? "Hide" : "Show"} English translation
                    </button>
                  ) : null}
                </div>
                {showTranslation[d.id] && d.translatedText ? (
                  <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 font-sans text-xs text-slate-700">{d.translatedText}</pre>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Replies</SectionTitle>
        {m.replies.filter((r) => r.status !== "QUEUED").map((r) => (
          <div key={r.id} className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
            <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <StatusBadge value={r.status} />
              {r.automatic ? "Sent automatically" : `Approved by ${r.approvedBy ?? "an operator"}`}
              {r.sentAt ? ` · ${formatDateTime(r.sentAt)}` : ""} · to {r.toAddress}
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-700">{r.body}</pre>
          </div>
        ))}
        {pendingDraft ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-amber-700">Drafted for review — not sent automatically because of the flags above.</p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={9}
              aria-label="Reply draft"
              className="w-full rounded-lg border border-slate-300 p-3 text-sm"
            />
            <Button busy={busy === "reply"} disabled={draft.trim().length < 10} onClick={() => void post(`/api/inbox/${m.id}/reply`, { body: draft }, "reply")}>
              <Send size={14} aria-hidden /> Approve &amp; send
            </Button>
          </div>
        ) : m.replies.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            {m.channel === "FAX" ? "Faxes are filed, not answered." : "No reply needed (hospital correspondence is filed on the case)."}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
