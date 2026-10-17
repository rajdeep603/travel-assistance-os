"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Handshake, Trophy, Users } from "lucide-react";
import { Button, Card, ErrorBanner, PageHeader, SkeletonRows, StatusBadge, readApiError } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

// Quotations submitted from the business case. Real prospects, so the page
// says what is in the pipeline and what was won, and each row opens the lead.

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
  createdBy: string | null;
  createdAt: string;
}

const FILTERS: { value: LeadStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

const eur = (n: number) => formatMoney(Math.round(n), "EUR");

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeadStatus | "ALL">("ALL");

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
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: leads?.length ?? 0 };
    for (const l of leads ?? []) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);
  const shown = (leads ?? []).filter((l) => filter === "ALL" || l.status === filter);
  const open = (leads ?? []).filter((l) => l.status === "NEW" || l.status === "CONTACTED");
  const won = (leads ?? []).filter((l) => l.status === "WON");
  const stats = [
    { icon: Users, label: "Leads", value: String(leads?.length ?? 0), note: `${counts.NEW ?? 0} new, ${counts.CONTACTED ?? 0} contacted` },
    { icon: Handshake, label: "Open pipeline", value: eur(open.reduce((s, l) => s + l.firstYearCost, 0)), note: "first-year value of new and contacted leads" },
    { icon: Trophy, label: "Won", value: eur(won.reduce((s, l) => s + l.firstYearCost, 0)), note: `${won.length} ${won.length === 1 ? "quotation" : "quotations"} accepted` },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Leads" subtitle="Quotations submitted from the business case. These are real prospects, kept apart from the demo data.">
        <Button onClick={() => router.push("/business-case?quote=new")}>
          <FileText size={15} aria-hidden />
          Generate quotation
        </Button>
      </PageHeader>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value, note }) => (
          <Card key={label} className="flex items-start gap-3 py-4">
            <span className="rounded-lg bg-brand/10 p-2 text-brand">
              <Icon size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight tabular-nums text-ink">{leads ? value : "—"}</p>
              <p className="text-sm font-semibold text-ink">{label}</p>
              <p className="text-xs text-muted">{note}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-5">
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

        {!leads && !error ? (
          <div className="mt-4">
            <SkeletonRows rows={4} />
          </div>
        ) : leads && leads.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-xl bg-canvas px-6 py-12 text-center">
            <Handshake size={28} className="text-brand" aria-hidden />
            <p className="mt-3 text-base font-semibold text-ink">No leads yet</p>
            <p className="mt-1 max-w-md text-sm text-muted">
              Generate a quotation from the business case with the visitor&apos;s numbers, and submit it. It lands here, ready to follow up.
            </p>
            <Button className="mt-4" onClick={() => router.push("/business-case?quote=new")}>
              <FileText size={15} aria-hidden />
              Generate quotation
            </Button>
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
                    <span className="block tabular-nums text-ink">{l.quoteNumber}</span>
                    <span className="block text-muted">{formatDate(l.createdAt)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums text-ink">{eur(l.firstYearCost)}</span>
                    <span className="block text-xs text-muted">first year</span>
                  </span>
                  <span className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:justify-end">
                    <StatusBadge value={l.status} />
                    <ChevronRight size={16} className="text-slate-400 transition-colors group-hover:text-brand" aria-hidden />
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
