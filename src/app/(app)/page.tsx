import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  Calculator,
  FileCheck2,
  FileText,
  FolderKanban,
  Headset,
  Inbox,
  Languages,
  MailCheck,
  MessageSquareText,
  Mic,
  ReceiptText,
  ScanText,
  Stethoscope,
  Timer,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, STATUS_DOTS, SectionTitle } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { LiveRefresh } from "@/components/live-refresh";
import { BRAND, POWERED_BY } from "@/lib/brand";
import { formatEnum } from "@/lib/format";
import { formatShortDuration, getOutcomes, type Outcomes } from "@/lib/services/outcomes";

export const dynamic = "force-dynamic";

const MODULES = [
  {
    href: "/documents",
    icon: FileText,
    title: "Medical Document AI",
    description: "Reads medical reports, invoices and discharge summaries in any language and extracts what the case needs.",
    tag: null,
  },
  {
    href: "/cases",
    icon: FolderKanban,
    title: "AI Case Manager",
    description: "Turns a call, e-mail or message into a prioritised case: urgency, location and next steps.",
    tag: null,
  },
  {
    href: "/claims",
    icon: ReceiptText,
    title: "Claims Automation",
    description: "Checks claim packs for completeness and flags issues, so handlers only make the decision.",
    tag: null,
  },
  {
    href: "/providers",
    icon: Stethoscope,
    title: "Provider Search",
    description: "Finds the right doctor nearby by specialty, language and availability, and books the visit.",
    tag: null,
  },
  {
    href: "/assistant",
    icon: MessageSquareText,
    title: "Internal AI Assistant",
    description: "Answers staff questions about procedures, cases and providers, with sources.",
    tag: null,
  },
  {
    href: "/voice",
    icon: Mic,
    title: "Voice Agent",
    description: "Talks with travellers in their language, finds a doctor and books the appointment.",
    tag: "Voice",
  },
  {
    href: "/calls",
    icon: Headset,
    title: "AI Call Center",
    description: "Phone agents answer every call and place outbound calls — triage, coverage, bookings, hospitals in Turkish.",
    tag: "Phone",
  },
  {
    href: "/inbox",
    icon: Inbox,
    title: "E-mail & Fax Automation",
    description: "Read claims and faxes (OCR), match the case, reply automatically and issue Letters of Guarantee.",
    tag: "Intake",
  },
];

const STORY: { step: string; href: string | null }[] = [
  { step: "Customer", href: null },
  { step: "Phone / Email / Fax", href: "/calls" },
  { step: "AI Understanding", href: "/cases" },
  { step: "Case Creation", href: "/cases" },
  { step: "Medical Documents", href: "/documents" },
  { step: "Letter of Guarantee", href: "/cases/CASE-1024" },
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
  "ESCALATED",
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
      outcomes,
    ] = await Promise.all([
      prisma.case.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.claim.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.provider.findMany({ select: { specialty: true, languages: true } }),
      prisma.appointment.count({
        where: { scheduledAt: { gte: now }, status: { in: ["PENDING", "CONFIRMED"] } },
      }),
      prisma.document.count({ where: { status: "PROCESSED" } }),
      prisma.documentExtraction.aggregate({ _avg: { confidence: true } }),
      getOutcomes(30),
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
      (claimCounts.INFO_REQUESTED ?? 0) +
      (claimCounts.ESCALATED ?? 0);

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
      outcomes,
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

const percent = (share: number | null) => (share == null ? null : Math.round(share * 100));

/** Six outcome figures, each with the evidence behind it. */
function OutcomeGrid({ outcomes: o }: { outcomes: Outcomes }) {
  const aiShare = percent(o.calls.aiShare);
  const inboxShare = percent(o.inbox.automatedShare);
  const cards: { icon: typeof Bot; accent: string; value: React.ReactNode; label: string; context: string }[] = [
    {
      icon: Bot,
      accent: "bg-sky-50 text-sky-600",
      value: aiShare == null ? "—" : <><CountUp value={aiShare} />%</>,
      label: "of calls handled end-to-end by AI",
      context: o.calls.ended ? `${o.calls.byAi} of ${o.calls.ended} calls · ${o.calls.transferred} handed to a person` : "No calls yet",
    },
    {
      icon: Timer,
      accent: "bg-emerald-50 text-emerald-600",
      value: o.calls.answerSeconds == null ? "Instant" : formatShortDuration(o.calls.answerSeconds),
      label: "to answer a call, day or night",
      context: "Every call is picked up by AI; no queue",
    },
    {
      icon: MailCheck,
      accent: "bg-indigo-50 text-indigo-600",
      value: inboxShare == null ? "—" : <><CountUp value={inboxShare} />%</>,
      label: "of e-mails & faxes handled automatically",
      context:
        o.inbox.replyMinutes != null
          ? `Median reply in ${formatShortDuration(o.inbox.replyMinutes * 60)} · ${o.inbox.received} received`
          : `${o.inbox.automated} of ${o.inbox.received} received`,
    },
    {
      icon: FileCheck2,
      accent: "bg-violet-50 text-violet-600",
      value: o.letters.turnaroundMinutes == null ? "—" : formatShortDuration(o.letters.turnaroundMinutes * 60),
      label: "from cost estimate to Letter of Guarantee",
      context: `${o.letters.sent} ${o.letters.sent === 1 ? "letter" : "letters"} sent to hospitals`,
    },
    {
      icon: ScanText,
      accent: "bg-amber-50 text-amber-600",
      value: <CountUp value={o.documents.read} />,
      label: "medical documents read by AI",
      context: "Reports, invoices, discharge summaries and handwritten faxes",
    },
    {
      icon: Languages,
      accent: "bg-rose-50 text-rose-600",
      value: <CountUp value={o.languages.length} />,
      label: "languages served",
      context: o.languages.slice(0, 5).join(", ") + (o.languages.length > 5 ? "…" : ""),
    },
  ];
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(({ icon: Icon, accent, value, label, context }, i) => (
        <Card key={label} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="flex items-start gap-4">
            <div className={`inline-flex shrink-0 rounded-xl p-2.5 ${accent}`}>
              <Icon size={22} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-4xl font-semibold tracking-tight text-slate-900">{value}</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{label}</p>
              <p className="mt-1 text-xs text-slate-500">{context}</p>
            </div>
          </div>
        </Card>
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
      ]
    : [];

  return (
    <div className="mx-auto max-w-7xl">
      {/* Hero: the pitch and the end-to-end journey, above the fold. */}
      <div className="animate-fade-up">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              {BRAND.name}
              <span className="ml-3 bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text align-middle text-lg font-medium text-transparent md:text-xl">
                {BRAND.tagline}
              </span>
            </h1>
            <p className="mt-2 max-w-2xl text-base text-slate-500">
              One journey from the first call to the settled claim: AI prepares every
              step, people stay in charge of care decisions.
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400">{POWERED_BY}</p>
          </div>
          <LiveRefresh />
        </div>

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

      {/* What the AI did, from the records; then today's workload. */}
      {stats ? (
        <>
          <SectionTitle className="mt-8">What the AI did · last {stats.outcomes.days} days</SectionTitle>
          <OutcomeGrid outcomes={stats.outcomes} />
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {kpis.map(({ icon: Icon, accent, value, label, context }, i) => (
              <Card key={label} className="animate-fade-up py-4" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center gap-3">
                  <div className={`inline-flex rounded-lg p-2 ${accent}`}>
                    <Icon size={18} aria-hidden />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tracking-tight text-slate-900">
                      <CountUp value={value} />
                    </p>
                    <p className="text-sm font-medium text-slate-600">{label}</p>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">{context}</p>
              </Card>
            ))}
            <Link
              href="/business-case"
              className="group block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              <Card interactive className="h-full border-blue-200 bg-gradient-to-br from-blue-600 to-sky-500 py-4 text-white">
                <div className="flex items-center gap-3">
                  <div className="inline-flex rounded-lg bg-white/15 p-2">
                    <Calculator size={18} aria-hidden />
                  </div>
                  <p className="text-base font-semibold">Your business case</p>
                </div>
                <p className="mt-1.5 text-sm text-blue-50">
                  Hours and cost {BRAND.name} saves in your operation
                  <ArrowRight size={14} className="ml-1 inline transition-transform group-hover:translate-x-0.5" aria-hidden />
                </p>
              </Card>
            </Link>
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Live figures are temporarily unavailable. They come back as soon as the
          database answers again.
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
          <Link
            key={href}
            href={href}
            className="group block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
          <Card
            interactive
            className="flex h-full animate-fade-up flex-col transition-all group-hover:-translate-y-0.5 group-hover:shadow-lg"
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
            <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors group-hover:bg-blue-700">
              Open
              <ArrowRight
                size={15}
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
