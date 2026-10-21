import Link from "next/link";
import {
  Calculator,
  FileText,
  FolderKanban,
  Headset,
  Inbox,
  MessageSquareText,
  Mic,
  PhoneCall,
  Plane,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { CountUp } from "@/components/count-up";
import { JourneyRoute, type RouteStop } from "@/components/dashboard/journey-route";
import { MoneyPanel } from "@/components/dashboard/money-panel";
import { NeedsPerson, type Decision } from "@/components/dashboard/needs-person";
import { NightShift } from "@/components/dashboard/night-shift";
import { StatusMix } from "@/components/dashboard/status-mix";
import { LiveRefresh } from "@/components/live-refresh";
import { BRAND, POWERED_BY } from "@/lib/brand";
import { formatShortDuration, getOutcomes, type Outcomes } from "@/lib/services/outcomes";
import { getMoneyOutcomes } from "@/lib/services/exposure";
import { getShiftHandover } from "@/lib/services/shift-handover";

export const dynamic = "force-dynamic";

/** Where each module sits on the journey decides its colour: talking (teal), reading (sky), acting (cobalt). */
const TONES = {
  talk: "bg-live/15 text-teal-700 group-hover:bg-live group-hover:text-white",
  read: "bg-brand-2/15 text-sky-700 group-hover:bg-brand-2 group-hover:text-white",
  act: "bg-brand/15 text-brand group-hover:bg-brand group-hover:text-white",
} as const;

const MODULES: { href: string; icon: LucideIcon; title: string; description: string; tone: keyof typeof TONES; tag?: string }[] = [
  { href: "/voice", icon: Mic, title: "Voice Agents", description: "Talks with travellers and hospitals in their language, finds a doctor and books the visit.", tone: "talk", tag: "Voice" },
  { href: "/calls", icon: Headset, title: "AI Call Center", description: "Answers every call and places outbound ones: triage, coverage, bookings, hospitals in Turkish.", tone: "talk", tag: "Phone" },
  { href: "/inbox", icon: Inbox, title: "E-mail & Fax Automation", description: "Reads e-mails and faxes, matches the case, replies and issues Letters of Guarantee.", tone: "read", tag: "Intake" },
  { href: "/documents", icon: FileText, title: "Medical Document AI", description: "Reads reports, invoices and discharge summaries in any language and extracts what the case needs.", tone: "read" },
  { href: "/cases", icon: FolderKanban, title: "AI Case Manager", description: "Turns a call, e-mail or message into a prioritised case with urgency, place and next steps.", tone: "act" },
  { href: "/providers", icon: Stethoscope, title: "Provider Search", description: "Finds the right doctor nearby by specialty, language and availability, and books the visit.", tone: "act" },
  { href: "/claims", icon: ReceiptText, title: "Claims Automation", description: "Checks claim packs and hospital bills, so handlers only make the decision.", tone: "act" },
  { href: "/assistant", icon: MessageSquareText, title: "Internal AI Assistant", description: "Answers the team about procedures, cases and providers, typed or out loud, with sources.", tone: "talk" },
];

const CASE_STATUS_ORDER = ["NEW", "IN_PROGRESS", "PENDING_INFO", "ESCALATED", "RESOLVED", "CLOSED"];
const CLAIM_STATUS_ORDER = ["SUBMITTED", "PROCESSING", "NEEDS_REVIEW", "INFO_REQUESTED", "ESCALATED", "APPROVED", "REJECTED", "PAID"];
const OPEN_CASE = ["NEW", "IN_PROGRESS", "PENDING_INFO", "ESCALATED"];
const CLAIM_IN_REVIEW = ["SUBMITTED", "PROCESSING", "NEEDS_REVIEW", "INFO_REQUESTED", "ESCALATED"];

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

async function getStats(night: string | null) {
  try {
    const now = new Date();
    const [casesByStatus, claimsByStatus, upcomingAppointments, documentsProcessed, draftLetters, proposedReview, escalatedCase, outcomes, money, handover] =
      await Promise.all([
        prisma.case.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.claim.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.appointment.count({ where: { scheduledAt: { gte: now }, status: { in: ["PENDING", "CONFIRMED"] } } }),
        prisma.document.count({ where: { status: "PROCESSED" } }),
        prisma.guaranteeLetter.findMany({ where: { status: "DRAFT" }, orderBy: { createdAt: "desc" }, select: { caseId: true } }),
        prisma.billReview.findFirst({
          where: { status: "PROPOSED" },
          orderBy: { createdAt: "desc" },
          select: { caseId: true, claim: { select: { ref: true } } },
        }),
        prisma.case.findFirst({ where: { status: "ESCALATED" }, orderBy: { updatedAt: "desc" }, select: { id: true } }),
        getOutcomes(30),
        getMoneyOutcomes(30),
        getShiftHandover({ night }),
      ]);
    const caseCounts = Object.fromEntries(casesByStatus.map((g) => [g.status, g._count._all])) as Record<string, number>;
    const claimCounts = Object.fromEntries(claimsByStatus.map((g) => [g.status, g._count._all])) as Record<string, number>;
    const sum = (counts: Record<string, number>, keys: string[]) => keys.reduce((total, k) => total + (counts[k] ?? 0), 0);
    // Each decision opens the record to decide on when there is one.
    const reviewHref = proposedReview?.caseId ? `/cases/${proposedReview.caseId}` : proposedReview?.claim ? `/claims/${proposedReview.claim.ref}` : "/claims";
    const decisions: Decision[] = [
      { count: money.awaitingDecision, label: plural(money.awaitingDecision, "hospital bill review to accept", "hospital bill reviews to accept"), href: reviewHref },
      {
        count: draftLetters.length,
        label: plural(draftLetters.length, "guarantee letter to approve", "guarantee letters to approve"),
        href: draftLetters[0] ? `/cases/${draftLetters[0].caseId}` : "/cases",
      },
      { count: claimCounts.NEEDS_REVIEW ?? 0, label: plural(claimCounts.NEEDS_REVIEW ?? 0, "claim to review", "claims to review"), href: "/claims" },
      { count: caseCounts.ESCALATED ?? 0, label: plural(caseCounts.ESCALATED ?? 0, "escalated case", "escalated cases"), href: escalatedCase ? `/cases/${escalatedCase.id}` : "/cases" },
      {
        count: caseCounts.PENDING_INFO ?? 0,
        label: plural(caseCounts.PENDING_INFO ?? 0, "case waiting for information", "cases waiting for information"),
        href: "/cases",
      },
    ];
    return {
      caseCounts,
      claimCounts,
      openCases: sum(caseCounts, OPEN_CASE),
      claimsInReview: sum(claimCounts, CLAIM_IN_REVIEW),
      upcomingAppointments,
      documentsProcessed,
      decisions,
      reviewHref,
      outcomes,
      money,
      handover,
    };
  } catch {
    return null;
  }
}

type Stats = NonNullable<Awaited<ReturnType<typeof getStats>>>;

function routeStops(s: Stats): RouteStop[] {
  const o = s.outcomes;
  return [
    { label: "Traveller", icon: Plane, detail: `${o.languages.length || "Any"} languages served`, kind: "end" },
    { label: "Call, e-mail or fax", icon: PhoneCall, detail: `${o.calls.ended} calls, ${o.inbox.received} messages`, href: "/calls" },
    { label: "AI triage", icon: Sparkles, detail: "Urgency, place, language", href: "/voice", kind: "ai" },
    { label: "Case", icon: FolderKanban, detail: `${s.openCases} open`, href: "/cases" },
    { label: "Medical documents", icon: FileText, detail: `${s.documentsProcessed} read by AI`, href: "/documents" },
    { label: "Guarantee of payment", icon: ShieldCheck, detail: `${o.letters.sent} sent to hospitals`, href: "/inbox" },
    { label: "Doctor booked", icon: Stethoscope, detail: `${s.upcomingAppointments} upcoming`, href: "/providers" },
    { label: "Claim", icon: ReceiptText, detail: `${s.claimsInReview} in review`, href: "/claims" },
    { label: "Your team", icon: UsersRound, detail: "Decides, with the work done", kind: "end" },
  ];
}

const percent = (share: number | null) => (share == null ? null : Math.round(share * 100));

/** The four outcomes a buyer asks about, under the route. */
function OutcomeStrip({ outcomes: o }: { outcomes: Outcomes }) {
  const aiShare = percent(o.calls.aiShare);
  const inboxShare = percent(o.inbox.automatedShare);
  const items: { value: React.ReactNode; label: string; context: string }[] = [
    {
      value: aiShare == null ? "—" : <><CountUp value={aiShare} />%</>,
      label: "of calls handled end-to-end by AI",
      context: o.calls.ended ? `${o.calls.byAi} of ${o.calls.ended} calls; ${o.calls.transferred} handed to a person` : "No calls yet",
    },
    {
      value: o.calls.answerSeconds == null ? "Instant" : formatShortDuration(o.calls.answerSeconds),
      label: "to answer a call, day or night",
      context: "Every call is picked up by AI; no queue",
    },
    {
      value: inboxShare == null ? "—" : <><CountUp value={inboxShare} />%</>,
      label: "of e-mails & faxes handled automatically",
      context: o.inbox.replyMinutes != null ? `Median reply in ${formatShortDuration(o.inbox.replyMinutes * 60)}` : `${o.inbox.automated} of ${o.inbox.received} received`,
    },
    {
      value: o.letters.turnaroundMinutes == null ? "—" : formatShortDuration(o.letters.turnaroundMinutes * 60),
      label: "from cost estimate to Letter of Guarantee",
      context: "Read, decided by the rules, faxed back",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-stage-line pt-6 md:grid-cols-4 md:gap-x-0 md:divide-x md:divide-stage-line">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 md:px-6 md:first:pl-0 md:last:pr-0">
          <p className="text-4xl font-semibold tracking-tight tabular-nums text-white md:text-[2.75rem] md:leading-none">{item.value}</p>
          <p className="mt-1 text-sm font-medium leading-snug text-stage-ink">{item.label}</p>
          <p className="mt-0.5 text-xs leading-snug text-stage-muted">{item.context}</p>
        </div>
      ))}
    </div>
  );
}

function Hero({ stats }: { stats: Stats | null }) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden rounded-3xl bg-stage px-5 py-6 text-stage-ink shadow-lg shadow-stage/20 md:px-8 md:py-7"
    >
      {/* A faint map grid: the route is drawn on it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgb(var(--c-stage-line))_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      />
      <div className="relative">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 id="hero-title" className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
              {BRAND.name}
            </h1>
            <p className="mt-1 text-lg font-medium text-brand-2 md:text-xl">{BRAND.tagline}</p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-stage-muted md:text-base">
              One journey from the first call to the settled claim. AI prepares every step; people stay in charge of care decisions.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 lg:items-end">
            <LiveRefresh tone="stage" />
            <div className="flex flex-wrap gap-2">
              <Link
                href="/voice"
                className="inline-flex items-center gap-2 rounded-xl bg-brand bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-[filter,box-shadow] duration-150 hover:brightness-[1.07] focus-visible:outline-brand-2"
              >
                <Mic size={16} aria-hidden />
                Talk to a voice agent
              </Link>
              <Link
                href="/business-case"
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-stage-ink ring-1 ring-stage-line transition-colors duration-150 hover:bg-stage-raised focus-visible:outline-brand-2"
              >
                <Calculator size={16} aria-hidden />
                Your business case
              </Link>
            </div>
          </div>
        </div>

        {stats ? (
          <>
            <div className="mt-7">
              <JourneyRoute stops={routeStops(stats)} />
            </div>
            <div className="mt-7">
              <OutcomeStrip outcomes={stats.outcomes} />
            </div>
          </>
        ) : (
          <p className="mt-6 rounded-xl bg-stage-raised px-4 py-3 text-sm text-stage-ink ring-1 ring-stage-line">
            Live figures are temporarily unavailable. They come back as soon as the database answers again.
          </p>
        )}
      </div>
    </section>
  );
}

function ModuleGrid() {
  return (
    <section aria-labelledby="modules-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="modules-title" className="text-base font-semibold text-ink">
          Every module, live
        </h2>
        {/* Keyboard hint: not on touch-only screens (an iPad without a keyboard). */}
        <p className="text-xs text-muted [@media(hover:none)]:hidden">
          Press <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink">⌘K</kbd> to jump to any record or agent
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:sidebar-hidden:grid-cols-4 xl:grid-cols-4">
        {MODULES.map(({ href, icon: Icon, title, description, tone, tag }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-2xl border border-line/60 bg-surface p-5 shadow-card transition-[border-color,box-shadow] duration-150 hover:border-brand/40 hover:shadow-card-hover focus-visible:outline-brand"
          >
            <div className="flex items-start justify-between gap-2">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-150 ${TONES[tone]}`}>
                <Icon size={20} aria-hidden />
              </span>
              {tag ? <span className="rounded-full bg-canvas px-2.5 py-0.5 text-[11px] font-medium text-muted">{tag}</span> : null}
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-ink transition-colors duration-150 group-hover:text-brand">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: { night?: string } }) {
  const night = typeof searchParams.night === "string" && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.night) ? searchParams.night : null;
  const stats = await getStats(night);
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Hero stats={stats} />

      {stats ? (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <MoneyPanel money={stats.money} href={stats.reviewHref} />
            </div>
            <NeedsPerson decisions={stats.decisions} />
          </div>
          {stats.handover ? <NightShift handover={stats.handover} waiting={stats.decisions.reduce((n, d) => n + d.count, 0)} /> : null}
          <div className="grid gap-5 lg:grid-cols-2">
            <StatusMix title="Caseload" noun="cases" counts={stats.caseCounts} order={CASE_STATUS_ORDER} href="/cases" columns={3} />
            <StatusMix title="Claims pipeline" noun="claims" counts={stats.claimCounts} order={CLAIM_STATUS_ORDER} href="/claims" columns={4} />
          </div>
        </>
      ) : null}

      <ModuleGrid />
      <p className="pb-2 text-center text-xs text-muted">{POWERED_BY}</p>
    </div>
  );
}
