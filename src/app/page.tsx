import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  FileText,
  FolderKanban,
  Languages,
  MessageSquareText,
  Mic,
  ReceiptText,
  ScanSearch,
  Stethoscope,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, STATUS_DOTS, SectionTitle } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { formatEnum } from "@/lib/format";

export const dynamic = "force-dynamic";

const MODULES = [
  {
    href: "/documents",
    icon: FileText,
    title: "Medical Document AI",
    description: "Extract structured information from medical documents.",
    tag: "Priority",
  },
  {
    href: "/cases",
    icon: FolderKanban,
    title: "AI Case Manager",
    description: "Turn incoming assistance requests into actionable cases.",
    tag: "Priority",
  },
  {
    href: "/claims",
    icon: ReceiptText,
    title: "Claims Automation",
    description: "Assist with claim document processing and review.",
    tag: null,
  },
  {
    href: "/providers",
    icon: Stethoscope,
    title: "Provider Search",
    description: "Find suitable healthcare providers.",
    tag: null,
  },
  {
    href: "/assistant",
    icon: MessageSquareText,
    title: "Internal AI Assistant",
    description: "Ask questions about cases, providers and operational knowledge.",
    tag: null,
  },
  {
    href: "/voice",
    icon: Mic,
    title: "Voice Medical Assistance Agent",
    description: "Help travellers find and book medical appointments through voice.",
    tag: "Voice",
  },
];

const STORY: { step: string; href: string | null }[] = [
  { step: "Customer", href: null },
  { step: "Voice / Email", href: "/voice" },
  { step: "AI Understanding", href: "/cases" },
  { step: "Case Creation", href: "/cases" },
  { step: "Medical Documents", href: "/documents" },
  { step: "Provider Search", href: "/providers" },
  { step: "Appointment", href: "/providers" },
  { step: "Claims", href: "/claims" },
  { step: "Human Operations", href: null },
];

const CASE_STATUS_ORDER = [
  "NEW",
  "IN_PROGRESS",
  "PENDING_INFO",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
];
const CLAIM_STATUS_ORDER = [
  "SUBMITTED",
  "PROCESSING",
  "NEEDS_REVIEW",
  "INFO_REQUESTED",
  "APPROVED",
  "REJECTED",
  "PAID",
];

async function getStats() {
  try {
    const now = new Date();
    const [
      casesByStatus,
      claimsByStatus,
      providers,
      upcomingAppointments,
      documentsProcessed,
      confidenceAgg,
    ] = await Promise.all([
      prisma.case.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.claim.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.provider.findMany({ select: { specialty: true, languages: true } }),
      prisma.appointment.count({
        where: { scheduledAt: { gte: now }, status: { in: ["PENDING", "CONFIRMED"] } },
      }),
      prisma.document.count({ where: { status: "PROCESSED" } }),
      prisma.documentExtraction.aggregate({ _avg: { confidence: true } }),
    ]);

    const caseCounts = Object.fromEntries(
      casesByStatus.map((g) => [g.status, g._count._all])
    ) as Record<string, number>;
    const claimCounts = Object.fromEntries(
      claimsByStatus.map((g) => [g.status, g._count._all])
    ) as Record<string, number>;

    const openCases = CASE_STATUS_ORDER.filter(
      (s) => s !== "RESOLVED" && s !== "CLOSED"
    ).reduce((sum, s) => sum + (caseCounts[s] ?? 0), 0);
    const claimsInReview =
      (claimCounts.SUBMITTED ?? 0) +
      (claimCounts.PROCESSING ?? 0) +
      (claimCounts.NEEDS_REVIEW ?? 0) +
      (claimCounts.INFO_REQUESTED ?? 0);

    return {
      caseCounts,
      claimCounts,
      openCases,
      claimsInReview,
      providerCount: providers.length,
      specialtyCount: new Set(providers.map((p) => p.specialty)).size,
      languageCount: new Set(providers.flatMap((p) => p.languages)).size,
      upcomingAppointments,
      documentsProcessed,
      avgConfidence: confidenceAgg._avg.confidence,
    };
  } catch {
    return null;
  }
}

function StatusBars({
  counts,
  order,
}: {
  counts: Record<string, number>;
  order: string[];
}) {
  const rows = order
    .map((status) => ({ status, count: counts[status] ?? 0 }))
    .filter((r) => r.count > 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-slate-400">No records yet.</p>;
  }
  return (
    <div className="mt-3 space-y-2.5">
      {rows.map(({ status, count }, i) => (
        <div key={status} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2">
          <span className="flex items-center gap-1.5 truncate text-xs font-medium text-slate-600">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOTS[status] ?? "bg-slate-400"}`}
              aria-hidden
            />
            {formatEnum(status)}
          </span>
          <div className="h-3 overflow-hidden rounded-r bg-slate-100">
            <div
              className="animate-bar-grow h-full rounded-r bg-blue-600"
              style={{ width: `${(count / max) * 100}%`, animationDelay: `${i * 70}ms` }}
            />
          </div>
          <span className="text-right text-xs font-semibold tabular-nums text-slate-700">
            {count}
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const stats = await getStats();

  const kpis = stats
    ? [
        {
          icon: FolderKanban,
          accent: "bg-blue-50 text-blue-600",
          value: stats.openCases,
          label: "Open cases",
          context: "being worked right now",
        },
        {
          icon: ReceiptText,
          accent: "bg-amber-50 text-amber-600",
          value: stats.claimsInReview,
          label: "Claims in review",
          context: "AI-checked, human-decided",
        },
        {
          icon: CalendarCheck,
          accent: "bg-emerald-50 text-emerald-600",
          value: stats.upcomingAppointments,
          label: "Upcoming appointments",
          context: "booked by AI + web",
        },
        {
          icon: Stethoscope,
          accent: "bg-sky-50 text-sky-600",
          value: stats.providerCount,
          label: "Network providers",
          context: `${stats.specialtyCount} specialties`,
        },
        {
          icon: ScanSearch,
          accent: "bg-indigo-50 text-indigo-600",
          value: stats.documentsProcessed,
          label: "Documents AI-processed",
          context:
            stats.avgConfidence != null
              ? `${Math.round(stats.avgConfidence * 100)}% avg confidence`
              : "structured extraction",
        },
        {
          icon: Languages,
          accent: "bg-violet-50 text-violet-600",
          value: stats.languageCount,
          label: "Provider languages",
          context: "matched to the traveller",
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-7xl">
      {/* Hero: the pitch and the end-to-end journey, above the fold. */}
      <div className="animate-fade-up">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
          Travel Assistance{" "}
          <span className="bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
            AI Platform
          </span>
        </h1>
        <p className="mt-2 max-w-2xl text-base text-slate-500">
          One journey, six AI modules: from the first call to the settled claim —
          AI prepares every step, people stay in charge of care decisions.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-y-2">
          {STORY.map(({ step, href }, i) => {
            const endpoint = i === 0 || i === STORY.length - 1;
            const pill = (
              <span
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors md:text-sm ${
                  endpoint
                    ? "bg-slate-900 text-white"
                    : href
                      ? "border border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400 hover:bg-blue-100"
                      : "bg-slate-200 text-slate-700"
                }`}
              >
                {step}
              </span>
            );
            return (
              <span key={step} className="flex items-center">
                {href ? <Link href={href}>{pill}</Link> : pill}
                {i < STORY.length - 1 ? (
                  <ArrowRight size={14} className="mx-1 shrink-0 text-slate-400" aria-hidden />
                ) : null}
              </span>
            );
          })}
        </div>
      </div>

      {/* Live platform numbers, straight from the demo database. */}
      {stats ? (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map(({ icon: Icon, accent, value, label, context }, i) => (
            <Card
              key={label}
              className="animate-fade-up py-4"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className={`mb-2.5 inline-flex rounded-lg p-2 ${accent}`}>
                <Icon size={18} aria-hidden />
              </div>
              <p className="text-3xl font-semibold tracking-tight text-slate-900">
                <CountUp value={value} />
              </p>
              <p className="mt-0.5 text-xs font-semibold text-slate-600">{label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{context}</p>
            </Card>
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          The database is currently unreachable — live counters are hidden. The
          module demos will retry automatically.
        </div>
      )}

      {stats ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card>
            <SectionTitle>Caseload by status</SectionTitle>
            <StatusBars counts={stats.caseCounts} order={CASE_STATUS_ORDER} />
          </Card>
          <Card>
            <SectionTitle>Claims pipeline</SectionTitle>
            <StatusBars counts={stats.claimCounts} order={CLAIM_STATUS_ORDER} />
          </Card>
        </div>
      ) : null}

      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {MODULES.map(({ href, icon: Icon, title, description, tag }, i) => (
          <Card
            key={href}
            className="group flex animate-fade-up flex-col transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start justify-between">
              <div className="rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 p-2.5 text-blue-600 transition-transform group-hover:scale-105">
                <Icon size={22} aria-hidden />
              </div>
              {tag ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                  {tag}
                </span>
              ) : null}
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-500">
              {description}
            </p>
            <Link
              href={href}
              className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Launch Demo
              <ArrowRight
                size={15}
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
