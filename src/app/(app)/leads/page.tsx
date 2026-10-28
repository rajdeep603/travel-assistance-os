"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, ChevronRight, Download, FileText, Handshake, QrCode, ScanLine, Smartphone, Trophy, Users } from "lucide-react";
import { Button, Card, ErrorBanner, PageHeader, SkeletonRows, StatusBadge, readApiError } from "@/components/ui";
import { ImportMeetingsButton, type ImportCounts } from "@/components/leads/import-meetings";
import { ScanCardButton } from "@/components/leads/scan-card";
import { UpcomingMeetings } from "@/components/leads/upcoming-meetings";
import { VisitorQr } from "@/components/leads/visitor-qr";
import { formatDate, formatDayTime, formatMoney } from "@/lib/format";
import { leadSourceLabel, type LeadSourceId } from "@/lib/lead-sources";

// Quotations submitted from the business case, visitors who scanned the
// booth's QR code, business cards and the meetings booked for the show.
// Real prospects, so the page opens on the day's meetings, says what is in
// the pipeline and what was won, and each row opens the lead.

type LeadStatus = "NEW" | "CONTACTED" | "WON" | "LOST";

interface LeadRow {
  id: string;
  ref: string;
  quoteNumber: string;
  customerName: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  oneTimeTotal: number;
  monthlyCost: number;
  firstYearCost: number;
  netAnnualSaving: number;
  status: LeadStatus;
  source: LeadSourceId;
  role: string | null;
  meetingAt: string | null;
  brief: string | null;
  createdBy: string | null;
  createdAt: string;
}

const quoted = (l: LeadRow) => l.quoteNumber.length > 0;

const FILTERS: { value: LeadStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

const eur = (n: number) => formatMoney(Math.round(n), "EUR");

/** How a lead without a quotation came in, on its row. */
const SOURCE_ICONS = { VISITOR: Smartphone, CARD: ScanLine, MEETING: CalendarClock, QUOTATION: FileText } as const;

function SourceLine({ source }: { source: LeadSourceId }) {
  const Icon = SOURCE_ICONS[source];
  return (
    <span className="flex items-center gap-1 text-ink">
      <Icon size={13} className="shrink-0 text-brand" aria-hidden /> {source === "VISITOR" ? "From the QR page" : leadSourceLabel(source)}
    </span>
  );
}

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeadStatus | "ALL">("ALL");
  const [qrOpen, setQrOpen] = useState(false);
  const [imported, setImported] = useState<ImportCounts | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    fetch("/api/leads")
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res, "Leads couldn't be loaded."));
        return (await res.json()) as { leads: LeadRow[] };
      })
      .then((body) => live && setLeads(body.leads))
      .catch((err) => live && setError(err instanceof Error ? err.message : "Leads couldn't be loaded."));
    return () => {
      live = false;
    };
  }, [reload]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: leads?.length ?? 0 };
    for (const l of leads ?? []) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);
  const shown = (leads ?? []).filter((l) => filter === "ALL" || l.status === filter);
  const open = (leads ?? []).filter((l) => (l.status === "NEW" || l.status === "CONTACTED") && quoted(l));
  const won = (leads ?? []).filter((l) => l.status === "WON");
  const visitors = (leads ?? []).filter((l) => l.source === "VISITOR").length;
  const stats = [
    {
      icon: Users,
      label: "Leads",
      value: String(leads?.length ?? 0),
      note: `${counts.NEW ?? 0} new, ${counts.CONTACTED ?? 0} contacted${visitors ? ` · ${visitors} from the QR page` : ""}`,
    },
    { icon: Handshake, label: "Open pipeline", value: eur(open.reduce((s, l) => s + l.firstYearCost, 0)), note: "first-year value of quoted leads still open" },
    { icon: Trophy, label: "Won", value: eur(won.reduce((s, l) => s + l.firstYearCost, 0)), note: `${won.length} ${won.length === 1 ? "quotation" : "quotations"} accepted` },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Leads" subtitle="Your booked meetings, quotations from the business case, visitors from the booth's QR page and business cards. Real prospects, kept apart from the demo data.">
        <div className="flex flex-wrap items-center gap-2">
          <ScanCardButton />
          <Button variant="secondary" onClick={() => setQrOpen(true)}>
            <QrCode size={15} aria-hidden />
            Visitor QR code
          </Button>
          <Button onClick={() => router.push("/business-case?quote=new")}>
            <FileText size={15} aria-hidden />
            Generate quotation
          </Button>
        </div>
      </PageHeader>
      {qrOpen ? <VisitorQr onClose={() => setQrOpen(false)} /> : null}

      {error ? <ErrorBanner message={error} /> : null}

      {leads ? <UpcomingMeetings leads={leads} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value, note }) => (
          <Card key={label} className="flex items-start gap-3 py-4">
            <span className="rounded-lg bg-brand/10 p-2 text-brand">
              <Icon size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-bold tracking-tight tabular-nums text-ink">{leads ? value : "—"}</p>
              <p className="text-sm font-semibold text-ink">{label}</p>
              <p className="text-xs text-muted">{note}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show leads by status">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors duration-150 ${
                  filter === f.value ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink hover:bg-canvas"
                }`}
              >
                {f.label} <span className={`tabular-nums ${filter === f.value ? "text-white/80" : "text-muted"}`}>{counts[f.value] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ImportMeetingsButton
              onImported={(result) => {
                setImported(result);
                setReload((n) => n + 1);
              }}
            />
            {leads?.length ? (
              <a
                href="/api/leads/export"
                download
                title="Every lead as a spreadsheet, for your CRM"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-sm transition-all duration-150 hover:border-brand/40 hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <Download size={15} aria-hidden />
                Export CSV
              </a>
            ) : null}
          </div>
        </div>
        {imported ? (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-brand/[0.06] px-3 py-2 text-sm text-ink" role="status">
            <CheckCircle2 size={15} className="shrink-0 text-brand" aria-hidden />
            <span>
              Meetings imported: <span className="font-semibold tabular-nums">{imported.created}</span> new,{" "}
              <span className="font-semibold tabular-nums">{imported.updated}</span> updated.
            </span>
          </p>
        ) : null}

        {!leads && !error ? (
          <div className="mt-4">
            <SkeletonRows rows={4} />
          </div>
        ) : leads && leads.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-xl bg-canvas px-6 py-12 text-center">
            <Handshake size={28} className="text-brand" aria-hidden />
            <p className="mt-3 text-base font-semibold text-ink">No leads yet</p>
            <p className="mt-1 max-w-md text-sm text-muted">
              Show visitors the QR code to scan with their phone, scan their business card, or generate a quotation from the business case with their numbers. Import the meetings you booked to see each day&apos;s in order. Every lead lands here, ready to follow up.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => setQrOpen(true)}>
                <QrCode size={15} aria-hidden />
                Visitor QR code
              </Button>
              <Button onClick={() => router.push("/business-case?quote=new")}>
                <FileText size={15} aria-hidden />
                Generate quotation
              </Button>
            </div>
          </div>
        ) : shown.length === 0 ? (
          <p className="mt-4 rounded-xl bg-canvas px-4 py-8 text-center text-sm text-muted">No leads with this status.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line" aria-label="Leads">
            {shown.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/leads/${l.id}`}
                  className="group -mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 transition-colors duration-150 hover:bg-canvas md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{l.companyName}</span>
                    <span className="block truncate text-sm text-muted">
                      {l.customerName} · <span className="tabular-nums">{l.ref}</span>
                    </span>
                  </span>
                  <span className="hidden min-w-0 text-sm md:block">
                    <span className="block truncate text-ink">{l.email ?? "No e-mail"}</span>
                    <span className="block truncate text-muted">{l.phone ?? "No phone"}</span>
                  </span>
                  <span className="hidden text-sm md:block">
                    {quoted(l) ? <span className="block tabular-nums text-ink">{l.quoteNumber}</span> : <SourceLine source={l.source} />}
                    <span className="block tabular-nums text-muted">{l.meetingAt ? formatDayTime(l.meetingAt) : formatDate(l.createdAt)}</span>
                  </span>
                  <span className="text-right">
                    {quoted(l) ? (
                      <>
                        <span className="block font-semibold tabular-nums text-ink">{eur(l.firstYearCost)}</span>
                        <span className="block text-xs text-muted">first year</span>
                      </>
                    ) : (
                      <span className="block text-xs text-muted">No quotation yet</span>
                    )}
                  </span>
                  <span className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:justify-end">
                    <StatusBadge value={l.status} />
                    <ChevronRight size={16} className="text-slate-400 transition-colors group-hover:text-brand rtl:rotate-180" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
