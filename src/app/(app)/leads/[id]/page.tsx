"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarPlus, Download, FileText, Printer, Smartphone, Trash2 } from "lucide-react";
import { Button, Card, ErrorBanner, KeyValue, PageHeader, SectionTitle, SkeletonRows, StatusBadge, readApiError } from "@/components/ui";
import { BeforeMeeting } from "@/components/leads/before-meeting";
import { FollowUp } from "@/components/leads/follow-up";
import { LeadCalls } from "@/components/leads/lead-calls";
import { MeetingNotes } from "@/components/leads/meeting-notes";
import { QuotationPreview } from "@/components/quotation/quotation-preview";
import { businessCaseReport, longDate, quoteMeta, type BusinessCaseInput } from "@/lib/business-case";
import { printElement } from "@/lib/client/print";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { LeadSourceId } from "@/lib/lead-sources";
import { painLabel, segmentLabel } from "@/lib/meeting-notes";

// One lead: who it is, where it stands, and the quotation exactly as it was
// submitted, to print or download again. A booked meeting opens on its brief.
// A visitor from the QR page, a business card or a booked meeting has no
// quotation yet: what we know is shown instead, and one can be generated.

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
  source: LeadSourceId;
  role: string | null;
  message: string | null;
  segment: string | null;
  pains: string[];
  pilot: string | null;
  notes: string | null;
  nextStep: string | null;
  nextStepOn: string | null;
  followUpSentAt: string | null;
  contactConsentAt: string | null;
  contactConsentBy: string | null;
  meetingAt: string | null;
  brief: string | null;
  createdBy: string | null;
  createdAt: string;
  input: BusinessCaseInput;
}

/** Where a lead without a quotation came from, after its ref and contact. */
const ORIGIN: Record<Exclude<LeadSourceId, "QUOTATION">, string> = {
  VISITOR: "left their details on the QR page",
  CARD: "from their business card",
  MEETING: "booked meeting",
};

const STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

const eur = (n: number) => formatMoney(Math.round(n), "EUR");

/** What a visitor told us on the QR page, in their words. */
function VisitorRequest({ lead }: { lead: Pick<LeadDetail, "role" | "segment" | "pains" | "message" | "createdAt"> }) {
  const pains = lead.pains.map(painLabel).filter((p): p is string => Boolean(p));
  return (
    <Card className="border-brand/20 bg-gradient-to-br from-brand/[0.06] to-transparent">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Smartphone size={16} aria-hidden />
        </span>
        <SectionTitle>What they asked for on the QR page</SectionTitle>
      </div>
      <dl className="mt-3 grid gap-x-4 sm:grid-cols-2">
        <KeyValue label="Organisation" value={segmentLabel(lead.segment)} />
        <KeyValue label="Role" value={lead.role} />
      </dl>
      <p className="mt-2 text-xs font-medium text-muted">Would solve first</p>
      {pains.length ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {pains.map((p) => (
            <li key={p} className="rounded-full bg-brand bg-brand-gradient px-2.5 py-1 text-xs font-medium text-white">
              {p}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-slate-400">Nothing picked</p>
      )}
      {lead.message ? <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm leading-relaxed text-ink ring-1 ring-line">{lead.message}</p> : null}
    </Card>
  );
}

export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"status" | "pdf" | "print" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // "Add a meeting brief" on a lead that has neither a meeting time nor a brief yet.
  const [planning, setPlanning] = useState(false);
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
  const quoted = Boolean(lead?.quoteNumber);

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
        <ArrowLeft size={14} className="rtl:rotate-180" aria-hidden /> All leads
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
            subtitle={
              quoted || lead.source === "QUOTATION"
                ? `${lead.ref} · ${lead.customerName} · submitted ${formatDateTime(lead.createdAt)}${lead.createdBy && lead.createdBy !== "visitor" ? ` by ${lead.createdBy}` : ""}`
                : `${lead.ref} · ${lead.customerName}${lead.role ? `, ${lead.role}` : ""} · ${ORIGIN[lead.source]}${lead.source === "MEETING" ? "" : `, ${formatDateTime(lead.createdAt)}`}`
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {lead.meetingAt || lead.brief || planning ? null : (
                <Button variant="secondary" onClick={() => setPlanning(true)}>
                  <CalendarPlus size={15} aria-hidden />
                  Add a meeting brief
                </Button>
              )}
              {quoted ? (
                <>
                  <Button variant="secondary" busy={busy === "print"} onClick={() => void print()}>
                    {busy === "print" ? null : <Printer size={15} aria-hidden />}
                    Print
                  </Button>
                  <Button busy={busy === "pdf"} onClick={() => void download()}>
                    {busy === "pdf" ? null : <Download size={15} aria-hidden />}
                    Download PDF
                  </Button>
                </>
              ) : (
                <Button onClick={() => router.push(`/business-case?quote=new&lead=${encodeURIComponent(lead.id)}`)}>
                  <FileText size={15} aria-hidden />
                  Generate quotation
                </Button>
              )}
            </div>
          </PageHeader>

          {lead.meetingAt || lead.brief || planning ? (
            <BeforeMeeting
              leadId={lead.id}
              value={lead}
              startEditing={planning && !lead.meetingAt && !lead.brief}
              onSaved={(v) => setLead((l) => l && { ...l, ...v })}
              onCancel={() => setPlanning(false)}
            />
          ) : null}

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
                  {/* A visitor's role is with their request, below. */}
                  {lead.role && lead.source !== "VISITOR" ? <KeyValue label="Role" value={lead.role} /> : null}
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
                          <bdi dir="ltr">{lead.phone}</bdi>
                        </a>
                      ) : null
                    }
                  />
                  <KeyValue
                    label="Agreed to e-mail"
                    value={
                      lead.contactConsentAt ? (
                        <>
                          {formatDate(lead.contactConsentAt)}
                          <span className="text-muted">
                            {lead.contactConsentBy === "visitor" ? ", on the QR page" : lead.contactConsentBy ? `, recorded by ${lead.contactConsentBy}` : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">Not yet: ask before you send</span>
                      )
                    }
                  />
                </dl>
              </Card>

              {quoted ? (
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
              ) : (
              <Card>
                <SectionTitle>Quotation</SectionTitle>
                <p className="mt-2 text-sm text-muted">None yet. Generate one from the business case with their numbers; it will be filed on this lead.</p>
              </Card>
              )}

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
                {lead.source === "VISITOR" ? <VisitorRequest lead={lead} /> : null}
                <MeetingNotes leadId={lead.id} value={lead} onSaved={(v) => setLead({ ...lead, ...v })} />
                <LeadCalls lead={lead} onLeadChange={(v) => setLead((l) => l && { ...l, ...v, status: v.status as LeadStatus })} />
                <FollowUp
                  leadId={lead.id}
                  sentAt={lead.followUpSentAt}
                  quoted={quoted}
                  onSent={(v) => setLead({ ...lead, status: v.status as LeadStatus, followUpSentAt: v.followUpSentAt })}
                />
              </div>
              {quoted ? (
                <div ref={previewRef}>
                  <QuotationPreview report={report} meta={meta} />
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
