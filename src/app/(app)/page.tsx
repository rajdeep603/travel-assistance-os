import Link from "next/link";
import { cookies } from "next/headers";
import {
  ArrowRight,
  FileText,
  FolderKanban,
  Headset,
  Inbox,
  Mail,
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
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { DashboardHero } from "@/components/dashboard/hero";
import { JourneyRoute, type RouteStop } from "@/components/dashboard/journey-route";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { MoneyPanel } from "@/components/dashboard/money-panel";
import { NeedsPerson } from "@/components/dashboard/needs-person";
import { NightShift } from "@/components/dashboard/night-shift";
import { InsightsCard, RecentActivityCard, RecentCasesCard } from "@/components/dashboard/recent";
import { StatusDonut } from "@/components/dashboard/status-donut";
import { POWERED_BY } from "@/lib/brand";
import { getActivity, getRecentActivity, getRecentCases, type Activity, type RecentActivity, type RecentCase } from "@/lib/services/dashboard";
import { OVERVIEW_PERIODS, getOverview, overviewDays, type Overview } from "@/lib/services/overview";
import { OPERATION_TIME_ZONE, TIME_ZONE_COOKIE, isTimeZone } from "@/lib/time-zone";
import { UI_LANGUAGE_COOKIE, isUiLanguage, localeOf } from "@/lib/i18n";
import { T } from "@/components/i18n";

export const dynamic = "force-dynamic";

/** Pastel tiles, one hue per module, as in the feature cards. */
const TONES = {
  violet: "bg-violet-50 text-violet-600",
  teal: "bg-teal-50 text-teal-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  blue: "bg-blue-50 text-blue-600",
  rose: "bg-rose-50 text-rose-600",
  purple: "bg-purple-50 text-purple-600",
} as const;

const MODULES: { href: string; icon: LucideIcon; title: string; description: string; tone: keyof typeof TONES; tag?: string }[] = [
  { href: "/voice", icon: Mic, title: "Voice Agents", description: "Talks with travellers and hospitals in their language, finds a doctor and books the visit.", tone: "violet", tag: "Voice" },
  { href: "/calls", icon: Headset, title: "AI Call Center", description: "Answers every call and places outbound ones: triage, coverage, bookings, hospitals in Turkish.", tone: "teal", tag: "Phone" },
  { href: "/inbox", icon: Inbox, title: "E-mail & Fax Automation", description: "Reads e-mails and faxes, matches the case, replies and issues Letters of Guarantee.", tone: "emerald", tag: "Intake" },
  { href: "/documents", icon: FileText, title: "Medical Document AI", description: "Reads reports, invoices and discharge summaries in any language and extracts what the case needs.", tone: "amber" },
  { href: "/cases", icon: FolderKanban, title: "AI Case Manager", description: "Turns a call, e-mail or message into a prioritised case with urgency, place and next steps.", tone: "sky" },
  { href: "/providers", icon: Stethoscope, title: "Provider Search", description: "Finds the right doctor nearby by specialty, language and availability, and books the visit.", tone: "rose" },
  { href: "/claims", icon: ReceiptText, title: "Claims Automation", description: "Checks claim packs and hospital bills, so handlers only make the decision.", tone: "blue" },
  { href: "/assistant", icon: MessageSquareText, title: "Internal AI Assistant", description: "Answers the team about procedures, cases and providers, typed or out loud, with sources.", tone: "purple" },
];

/** The three modules the sample leads with, as tinted cards under the hero. */
const FEATURES: { href: string; icon: LucideIcon; title: string; description: string; card: string; tile: string; arrow: string }[] = [
  {
    href: "/voice",
    icon: Mic,
    title: "Voice Agents",
    description: "AI calls with travellers, hospitals and insurers, in their language",
    card: "border-violet-100 bg-violet-50/70 hover:border-violet-200",
    tile: "bg-violet-100 text-violet-600",
    arrow: "text-violet-600",
  },
  {
    href: "/claims",
    icon: ReceiptText,
    title: "Claims Automation",
    description: "Claim intake, document checks, bill review and settlement",
    card: "border-blue-100 bg-blue-50/70 hover:border-blue-200",
    tile: "bg-blue-100 text-blue-600",
    arrow: "text-blue-600",
  },
  {
    href: "/inbox",
    icon: Mail,
    title: "E-mail & Fax Automation",
    description: "Reads e-mails, faxes and WhatsApp, and routes each to its case",
    card: "border-emerald-100 bg-emerald-50/70 hover:border-emerald-200",
    tile: "bg-emerald-100 text-emerald-600",
    arrow: "text-emerald-600",
  },
];

type Stats = Overview;

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

function FeatureCards() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {FEATURES.map(({ href, icon: Icon, title, description, card, tile, arrow }) => (
        <Link
          key={href}
          href={href}
          className={`group relative flex items-center gap-4 rounded-2xl border p-5 transition-[border-color,box-shadow] duration-150 hover:shadow-card-hover focus-visible:outline-brand md:flex-col md:items-start xl:flex-row xl:items-center ${card}`}
        >
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tile}`}>
            <Icon size={26} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-ink">
              <T>{title}</T>
            </span>
            <span className="mt-1 block text-sm leading-snug text-slate-600">
              <T>{description}</T>
            </span>
          </span>
          {/* Beside the text on phones and wide screens; in the corner when three cards share a tablet's width. */}
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm transition-transform duration-150 group-hover:translate-x-0.5 md:absolute md:end-5 md:top-5 xl:static rtl:group-hover:-translate-x-0.5 ${arrow}`}>
            <ArrowRight size={18} className="rtl:rotate-180" aria-hidden />
          </span>
        </Link>
      ))}
    </div>
  );
}

/** The assistance journey on a card: each stop links to its module, with its live count. */
function JourneyCard({ stats }: { stats: Stats }) {
  return (
    <section aria-labelledby="journey-title" className="rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6">
      <h2 id="journey-title" className="text-lg font-semibold text-ink">
        <T>The assistance journey</T>
      </h2>
      <p className="mb-5 mt-0.5 text-sm text-muted">
        <T>One journey from the first call to the settled claim. AI prepares every step; people stay in charge of care decisions.</T>
      </p>
      <JourneyRoute stops={routeStops(stats)} />
    </section>
  );
}

function ModuleGrid() {
  return (
    <section aria-labelledby="modules-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="modules-title" className="text-lg font-semibold text-ink">
          <T>Every module, live</T>
        </h2>
        {/* Keyboard hint: not on touch-only screens (an iPad without a keyboard). */}
        <p className="text-xs text-muted [@media(hover:none)]:hidden">
          Press <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink">⌘K</kbd> to jump to any record or agent
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:sidebar-hidden:grid-cols-4 xl:grid-cols-4">
        {MODULES.map(({ href, icon: Icon, title, description, tone, tag }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition-[border-color,box-shadow] duration-150 hover:border-brand/30 hover:shadow-card-hover focus-visible:outline-brand"
          >
            <div className="flex items-start justify-between gap-2">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${TONES[tone]}`}>
                <Icon size={21} aria-hidden />
              </span>
              {tag ? <span className="rounded-full bg-canvas px-2.5 py-0.5 text-[11px] font-medium text-muted ring-1 ring-line"><T>{tag}</T></span> : null}
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-ink transition-colors duration-150 group-hover:text-brand"><T>{title}</T></h3>
            <p className="mt-1 text-sm leading-relaxed text-muted"><T>{description}</T></p>
          </Link>
        ))}
      </div>
    </section>
  );
}

async function settled<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work;
  } catch {
    return null;
  }
}

export default async function DashboardPage({ searchParams }: { searchParams: { night?: string; days?: string } }) {
  const night = typeof searchParams.night === "string" && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.night) ? searchParams.night : null;
  const days = overviewDays(searchParams.days);
  const jar = cookies();
  const savedZone = jar.get(TIME_ZONE_COOKIE)?.value;
  const timeZone = isTimeZone(savedZone) ? savedZone : OPERATION_TIME_ZONE;
  const savedLang = jar.get(UI_LANGUAGE_COOKIE)?.value;
  const locale = localeOf(isUiLanguage(savedLang) ? savedLang : "en");
  const now = new Date();
  const [stats, activity, recent, recentCases] = await Promise.all([
    settled<Overview>(getOverview({ days, night })),
    settled<Activity>(getActivity(days, now)),
    settled<RecentActivity[]>(getRecentActivity(4, now)),
    settled<RecentCase[]>(getRecentCases(4, now)),
  ]);
  return (
    <div className="mx-auto max-w-[90rem] space-y-5">
      <DashboardHero days={days} />
      <FeatureCards />

      {stats && activity && recent && recentCases ? (
        <>
          <KpiCards activity={activity} />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <ActivityChart activity={activity} periods={OVERVIEW_PERIODS} night={night} timeZone={timeZone} locale={locale} />
            </div>
            <StatusDonut caseCounts={stats.caseCounts} claimCounts={stats.claimCounts} />
          </div>
          {/* Three across on a laptop; on a tablet two, with the insights below them across the full width. */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            <RecentActivityCard items={recent} locale={locale} now={now} />
            <RecentCasesCard cases={recentCases} locale={locale} now={now} />
            <InsightsCard outcomes={stats.outcomes} periodLabel={`Last ${days} days`} />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <MoneyPanel money={stats.money} href={stats.reviewHref} />
            </div>
            <NeedsPerson decisions={stats.decisions} />
          </div>
          {stats.handover ? <NightShift handover={stats.handover} timeZone={timeZone} waiting={stats.decisions.reduce((n, d) => n + d.count, 0)} /> : null}
          <JourneyCard stats={stats} />
        </>
      ) : (
        <p className="rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-ink shadow-card">
          Live figures are temporarily unavailable. They come back as soon as the database answers again.
        </p>
      )}

      <ModuleGrid />
      <p className="pb-2 text-center text-xs text-muted">{POWERED_BY}</p>
    </div>
  );
}
