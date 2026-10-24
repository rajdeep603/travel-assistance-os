import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  FileText,
  Mail,
  MessageCircle,
  MessageSquare,
  PhoneCall,
  Printer,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { T } from "@/components/i18n";
import { formatEnum, formatTimeAgo } from "@/lib/format";
import { formatShortDuration, type Outcomes } from "@/lib/services/outcomes";
import type { RecentActivity, RecentActivityKind, RecentCase } from "@/lib/services/dashboard";

// ---------------------------------------------------------------------------
// The dashboard's bottom row: what the AI did most recently, the cases
// opened most recently, and what the period's figures say. Four rows each, so
// the three cards line up.
// ---------------------------------------------------------------------------

function CardShell({
  title,
  icon,
  href,
  aside,
  className = "",
  listClassName = "flex flex-col",
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  href?: string;
  aside?: React.ReactNode;
  className?: string;
  listClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className={`flex h-full min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          {icon}
          <T>{title}</T>
        </h2>
        {href ? (
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand hover:underline hover:underline-offset-2">
            <T>View all</T>
            <ArrowRight size={15} className="rtl:rotate-180" aria-hidden />
          </Link>
        ) : (
          aside
        )}
      </div>
      <ul className={`-mx-2 flex-1 ${listClassName}`}>{children}</ul>
    </section>
  );
}

const ACTIVITY_ICONS: Record<RecentActivityKind, { icon: LucideIcon; tile: string }> = {
  call: { icon: PhoneCall, tile: "bg-emerald-50 text-emerald-600" },
  email: { icon: Mail, tile: "bg-blue-50 text-blue-600" },
  fax: { icon: Printer, tile: "bg-slate-100 text-slate-600" },
  sms: { icon: MessageSquare, tile: "bg-sky-50 text-sky-600" },
  whatsapp: { icon: MessageCircle, tile: "bg-emerald-50 text-emerald-600" },
  document: { icon: FileText, tile: "bg-amber-50 text-amber-600" },
  letter: { icon: ShieldCheck, tile: "bg-blue-50 text-blue-600" },
  claim: { icon: ReceiptText, tile: "bg-purple-50 text-purple-600" },
};

function Row({ href, lead, title, detail, time, wrap = false }: { href: string; lead: React.ReactNode; title: React.ReactNode; detail: React.ReactNode; time?: string; wrap?: boolean }) {
  return (
    <li className="flex-1">
      <Link href={href} className="flex h-full min-h-[3.5rem] items-center gap-3 rounded-xl px-2 py-1.5 transition-colors duration-150 hover:bg-canvas">
        {lead}
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-medium text-ink ${wrap ? "leading-snug" : "truncate"}`}>{title}</span>
          <span className={`block text-xs text-muted ${wrap ? "leading-snug" : "truncate"}`}>{detail}</span>
        </span>
        {time ? <span className="shrink-0 whitespace-nowrap text-xs text-muted">{time}</span> : null}
      </Link>
    </li>
  );
}

export function RecentActivityCard({ items, locale, now }: { items: RecentActivity[]; locale: string; now: Date }) {
  return (
    <CardShell title="Recent AI activity" href="/calls">
      {items.length ? (
        items.map((item) => {
          const { icon: Icon, tile } = ACTIVITY_ICONS[item.kind];
          return (
            <Row
              key={`${item.kind}-${item.href}-${item.at}`}
              href={item.href}
              lead={
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tile}`}>
                  <Icon size={18} aria-hidden />
                </span>
              }
              title={<T>{item.title}</T>}
              detail={<span translate="no">{item.detail}</span>}
              time={formatTimeAgo(item.at, locale, now)}
            />
          );
        })
      ) : (
        <li className="flex flex-1 items-center justify-center text-sm text-muted">
          <T>Nothing yet.</T>
        </li>
      )}
    </CardShell>
  );
}

const AVATARS = ["bg-blue-50 text-blue-600", "bg-purple-50 text-purple-600", "bg-emerald-50 text-emerald-600", "bg-amber-50 text-amber-700", "bg-rose-50 text-rose-600"];
const STATUS_TEXT: Record<string, string> = {
  NEW: "text-sky-600",
  IN_PROGRESS: "text-blue-600",
  PENDING_INFO: "text-amber-600",
  ESCALATED: "text-red-600",
  RESOLVED: "text-emerald-600",
  CLOSED: "text-slate-500",
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function RecentCasesCard({ cases, locale, now }: { cases: RecentCase[]; locale: string; now: Date }) {
  return (
    <CardShell title="Recent cases" href="/cases">
      {cases.map((c, i) => (
        <Row
          key={c.id}
          href={`/cases/${c.id}`}
          lead={
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${AVATARS[i % AVATARS.length]}`} aria-hidden>
              {initialsOf(c.patient)}
            </span>
          }
          title={<span translate="no">{c.title}</span>}
          detail={
            <>
              <span className="tabular-nums">{c.ref}</span> ·{" "}
              <span className={`font-medium ${STATUS_TEXT[c.status] ?? "text-muted"}`}>
                <T>{formatEnum(c.status)}</T>
              </span>
            </>
          }
          time={formatTimeAgo(c.at, locale, now)}
        />
      ))}
    </CardShell>
  );
}

const percent = (share: number | null) => (share == null ? null : Math.round(share * 100));

/** What the period's figures say, each with where it comes from. */
export function InsightsCard({ outcomes: o, periodLabel }: { outcomes: Outcomes; periodLabel: string }) {
  const aiShare = percent(o.calls.aiShare);
  const inboxShare = percent(o.inbox.automatedShare);
  const rows: { icon: LucideIcon; tile: string; value: string; label: string; context: string; href: string }[] = [
    {
      icon: PhoneCall,
      tile: "bg-emerald-50 text-emerald-600",
      value: aiShare == null ? "—" : `${aiShare}%`,
      label: "of calls handled end-to-end by AI",
      context: o.calls.ended ? `${o.calls.byAi} of ${o.calls.ended} calls; ${o.calls.transferred} handed to a person` : "No calls yet",
      href: "/calls",
    },
    {
      icon: Timer,
      tile: "bg-blue-50 text-blue-600",
      value: o.calls.answerSeconds == null ? "Instant" : formatShortDuration(o.calls.answerSeconds),
      label: "to answer a call, day or night",
      context: "Every call is picked up by AI; no queue",
      href: "/calls",
    },
    {
      icon: Mail,
      tile: "bg-amber-50 text-amber-600",
      value: inboxShare == null ? "—" : `${inboxShare}%`,
      label: "of e-mails & faxes handled automatically",
      context: o.inbox.replyMinutes != null ? `Median reply: ${formatShortDuration(o.inbox.replyMinutes * 60)}` : `${o.inbox.automated} of ${o.inbox.received} received`,
      href: "/inbox",
    },
    {
      icon: Clock3,
      tile: "bg-purple-50 text-purple-600",
      value: o.letters.turnaroundMinutes == null ? "—" : formatShortDuration(o.letters.turnaroundMinutes * 60),
      label: "from cost estimate to Letter of Guarantee",
      context: "Read, decided by the rules, faxed back",
      href: "/inbox",
    },
  ];
  return (
    <CardShell
      title="AI insights"
      className="md:col-span-2 xl:col-span-1"
      listClassName="flex flex-col md:grid md:grid-cols-2 md:gap-x-4 xl:flex"
      icon={<Sparkles size={18} className="text-violet-600" aria-hidden />}
      aside={
        <span className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted">
          <T>{periodLabel}</T>
        </span>
      }
    >
      {rows.map((r) => (
        <Row
          key={r.label}
          href={r.href}
          lead={
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${r.tile}`}>
              <r.icon size={18} aria-hidden />
            </span>
          }
          title={
            <>
              <span className="font-bold tabular-nums">{r.value}</span> <T>{r.label}</T>
            </>
          }
          detail={r.context}
          wrap
        />
      ))}
    </CardShell>
  );
}
