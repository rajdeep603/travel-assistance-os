"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Printer, Trash2 } from "lucide-react";
import { Button, Card, ErrorBanner, KeyValue, PageHeader, SectionTitle, SkeletonRows, StatusBadge, readApiError } from "@/components/ui";
import { FollowUp } from "@/components/leads/follow-up";
import { MeetingNotes } from "@/components/leads/meeting-notes";
import { QuotationPreview } from "@/components/quotation/quotation-preview";
import { businessCaseReport, longDate, quoteMeta, type BusinessCaseInput } from "@/lib/business-case";
import { printElement } from "@/lib/client/print";
import { formatDateTime, formatMoney } from "@/lib/format";

// One lead: who it is, where it stands, and the quotation exactly as it was
// submitted, to print or download again.

type LeadStatus = "NEW" | "CONTACTED" | "WON" | "LOST";

interface LeadDetail {
  id: string;
  ref: string;
  quoteNumber: string;
  quoteDate: string;
  customerName: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  segment: string | null;
  pains: string[];
  pilot: string | null;
  notes: string | null;
  nextStep: string | null;
  nextStepOn: string | null;
  followUpSentAt: string | null;
  createdBy: string | null;
  createdAt: string;
  input: BusinessCaseInput;
}

const STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

const eur = (n: number) => formatMoney(Math.round(n), "EUR");

export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"status" | "pdf" | "print" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/leads/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res, "This lead couldn't be loaded."));
        return (await res.json()) as { lead: LeadDetail };
      })
      .then((body) => live && setLead(body.lead))
      .catch((err) => live && setError(err instanceof Error ? err.message : "This lead couldn't be loaded."));
    return () => {
      live = false;
    };
  }, [id]);

  const report = useMemo(() => (lead ? businessCaseReport(lead.input) : null), [lead]);
  const meta = useMemo(() => (lead ? quoteMeta(lead.input, lead.quoteDate, lead.quoteNumber) : null), [lead]);

  async function setStatus(status: LeadStatus) {
    if (!lead || lead.status === status) return;
    setBusy("status");
    setError(null);
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error(await readApiError(res, "The status couldn't be changed."));
      setLead({ ...lead, status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The status couldn't be changed.");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy("pdf");
    setError(null);
    try {
      const res = await fetch(`/api/leads/${id}/pdf`);
      if (!res.ok) throw new Error(await readApiError(res, "The quotation couldn't be made. Please try again."));
      const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "quotation.pdf";
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The quotation couldn't be made. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function print() {
    const page = previewRef.current?.firstElementChild;
    if (!(page instanceof HTMLElement) || !lead) return;
    setBusy("print");
    try {
      await printElement(page, `Quotation ${lead.quoteNumber}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Printing didn't start. Download the PDF and print that instead.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res, "The lead couldn't be deleted."));
      router.push("/leads");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lead couldn't be deleted.");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-brand">
        <ArrowLeft size={14} aria-hidden /> All leads
      </Link>

      {error ? (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {!lead || !report || !meta ? (
        error ? null : (
          <Card>
            <SkeletonRows rows={5} />
          </Card>
        )
      ) : (
        <>
          <PageHeader
            title={lead.companyName}
            subtitle={`${lead.ref} · ${lead.customerName} · submitted ${formatDateTime(lead.createdAt)}${lead.createdBy ? ` by ${lead.createdBy}` : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" busy={busy === "print"} onClick={() => void print()}>
                {busy === "print" ? null : <Printer size={15} aria-hidden />}
                Print
              </Button>
              <Button busy={busy === "pdf"} onClick={() => void download()}>
                {busy === "pdf" ? null : <Download size={15} aria-hidden />}
                Download PDF
              </Button>
            </div>
          </PageHeader>

          <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <SectionTitle>Status</SectionTitle>
                  <StatusBadge value={lead.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Lead status">
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      aria-pressed={lead.status === s.value}
                      disabled={busy === "status"}
                      onClick={() => void setStatus(s.value)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150 disabled:opacity-60 ${
                        lead.status === s.value ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink hover:bg-canvas"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </Card>

              <Card>
                <SectionTitle>Contact</SectionTitle>
                <dl className="mt-2">
                  <KeyValue label="Customer" value={lead.customerName} />
                  <KeyValue label="Company" value={lead.companyName} />
                  <KeyValue
                    label="E-mail"
                    value={
                      lead.email ? (
                        <a href={`mailto:${lead.email}`} className="text-brand [overflow-wrap:anywhere] hover:underline">
                          {lead.email}
                        </a>
                      ) : null
                    }
                  />
                  <KeyValue
                    label="Phone"
                    value={
                      lead.phone ? (
                        <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="text-brand hover:underline">
                          {lead.phone}
                        </a>
                      ) : null
                    }
                  />
                </dl>
              </Card>

              <Card>
                <SectionTitle>Quotation</SectionTitle>
                <dl className="mt-2 grid grid-cols-2 gap-x-4">
                  <KeyValue label="Number" value={<span className="tabular-nums">{lead.quoteNumber}</span>} />
                  <KeyValue label="Valid until" value={longDate(meta.validUntil)} />
                  <KeyValue label="Services a month" value={<span className="tabular-nums">{eur(report.quote.monthlyRunningCost)}</span>} />
                  <KeyValue label="Service charges" value={<span className="tabular-nums">{eur(report.quote.oneTimeTotal)}</span>} />
                  <KeyValue label="First year in total" value={<span className="font-semibold tabular-nums">{eur(report.quote.firstYearCost)}</span>} />
                  <KeyValue label="Their net saving a year" value={<span className="tabular-nums">{eur(report.running.netAnnualSaving)}</span>} />
                </dl>
              </Card>

              <div className="px-1">
                {confirmDelete ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-800">Delete this lead and the contact details on it? This can&apos;t be undone.</p>
                    <div className="mt-2 flex gap-2">
                      <Button variant="danger" busy={busy === "delete"} onClick={() => void remove()}>
                        Delete lead
                      </Button>
                      <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                        Keep it
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:text-red-700"
                  >
                    <Trash2 size={14} aria-hidden />
                    Delete lead
                  </button>
                )}
              </div>
            </div>

            <div className="min-w-0 space-y-5">
              <div className="space-y-5">
                <MeetingNotes leadId={lead.id} value={lead} onSaved={(v) => setLead({ ...lead, ...v })} />
                <FollowUp
                  leadId={lead.id}
                  sentAt={lead.followUpSentAt}
                  onSent={(v) => setLead({ ...lead, status: v.status as LeadStatus, followUpSentAt: v.followUpSentAt })}
                />
              </div>
              <div ref={previewRef}>
                <QuotationPreview report={report} meta={meta} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
