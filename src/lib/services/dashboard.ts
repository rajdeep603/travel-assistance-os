import { prisma } from "@/lib/db";
import { INTERNAL_AGENT_IDS } from "@/lib/voice/agents/ids";
import { emptyCounts as empty, type Activity, type ActivityBucket, type ActivitySeries } from "@/lib/dashboard-series";

export type { Activity, ActivityBucket, ActivityCounts, ActivitySeries } from "@/lib/dashboard-series";

// ---------------------------------------------------------------------------
// The dashboard's activity: what the AI handled over the overview period
// (cases opened, claims checked, calls handled, messages read), bucket by
// bucket for the chart, the period before it for the trend, and the latest
// records. Counted from the records with the same windows as outcomes.ts, so
// the cards and the outcome figures agree.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const AI_HANDLED_CALL = ["COMPLETED", "VOICEMAIL"] as const;

export async function getActivity(days: number, now = new Date()): Promise<Activity> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const from = new Date(since.getTime() - days * DAY_MS);
  const [cases, claims, calls, messages] = await Promise.all([
    prisma.case.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
    prisma.claim.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
    prisma.call.findMany({
      where: { createdAt: { gte: from }, status: { in: [...AI_HANDLED_CALL] }, agentProfile: { notIn: INTERNAL_AGENT_IDS } },
      select: { createdAt: true },
    }),
    prisma.inboundMessage.findMany({ where: { receivedAt: { gte: from } }, select: { receivedAt: true } }),
  ]);

  const bucketDays = days > 30 ? 3 : 1;
  const count = Math.ceil(days / bucketDays);
  const buckets: ActivityBucket[] = Array.from({ length: count }, (_, i) => {
    const end = new Date(now.getTime() - (count - 1 - i) * bucketDays * DAY_MS);
    const start = new Date(Math.max(since.getTime(), end.getTime() - bucketDays * DAY_MS));
    return { start: start.toISOString(), end: end.toISOString(), ...empty() };
  });
  const totals = empty();
  const previous = empty();
  const recent = empty();
  const recentSince = now.getTime() - (days > 7 ? 7 : 1) * DAY_MS;

  const place = (series: ActivitySeries, at: Date) => {
    const t = at.getTime();
    if (t > now.getTime()) return;
    if (t < since.getTime()) {
      previous[series]++;
      return;
    }
    totals[series]++;
    if (t >= recentSince) recent[series]++;
    // Buckets are consecutive windows ending now; the newest is the last.
    const fromEnd = Math.floor((now.getTime() - t) / (bucketDays * DAY_MS));
    const bucket = buckets[Math.max(0, buckets.length - 1 - fromEnd)];
    bucket[series]++;
  };
  cases.forEach((c) => place("cases", c.createdAt));
  claims.forEach((c) => place("claims", c.createdAt));
  calls.forEach((c) => place("calls", c.createdAt));
  messages.forEach((m) => place("messages", m.receivedAt));

  return { days, bucketDays, buckets, totals, previous, recent };
}

// --- The latest records ----------------------------------------------------

export type RecentActivityKind = "call" | "email" | "fax" | "sms" | "whatsapp" | "document" | "letter" | "claim";

export interface RecentActivity {
  kind: RecentActivityKind;
  /** What the AI did, an interface string ("AI voice agent handled a call"). */
  title: string;
  /** The record it did it on, as written. */
  detail: string;
  at: string;
  href: string;
}

export interface RecentCase {
  id: string;
  ref: string;
  title: string;
  status: string;
  patient: string;
  at: string;
}

const firstLine = (s: string | null | undefined, max = 90) => {
  const line = (s ?? "").split(/\r?\n/)[0].trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};

const MESSAGE_TITLES: Record<string, { kind: RecentActivityKind; title: string }> = {
  EMAIL: { kind: "email", title: "E-mail read and routed" },
  FAX: { kind: "fax", title: "Fax read with OCR" },
  SMS: { kind: "sms", title: "SMS read and routed" },
  WHATSAPP: { kind: "whatsapp", title: "WhatsApp message handled" },
};

/** What the AI did most recently, across calls, messages, documents, letters and claims. */
export async function getRecentActivity(limit = 4, now = new Date()): Promise<RecentActivity[]> {
  const notAfter = { lte: now };
  const [calls, messages, documents, letters, claims] = await Promise.all([
    prisma.call.findMany({
      where: { status: { in: [...AI_HANDLED_CALL, "TRANSFERRED"] }, agentProfile: { notIn: INTERNAL_AGENT_IDS }, createdAt: notAfter },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, ref: true, direction: true, summary: true, createdAt: true },
    }),
    prisma.inboundMessage.findMany({
      where: { receivedAt: notAfter },
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: { id: true, ref: true, channel: true, subject: true, summary: true, receivedAt: true },
    }),
    prisma.document.findMany({
      where: { status: "PROCESSED", createdAt: notAfter },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { filename: true, caseId: true, createdAt: true },
    }),
    prisma.guaranteeLetter.findMany({
      where: { sentAt: notAfter },
      orderBy: { sentAt: "desc" },
      take: limit,
      select: { ref: true, hospitalName: true, caseId: true, sentAt: true },
    }),
    prisma.claim.findMany({
      where: { createdAt: notAfter },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { ref: true, summary: true, createdAt: true },
    }),
  ]);

  const items: RecentActivity[] = [
    ...calls.map((c) => ({
      kind: "call" as const,
      title: c.direction === "OUTBOUND" ? "AI voice agent placed a call" : "AI voice agent handled a call",
      detail: firstLine(c.summary) || c.ref,
      at: c.createdAt.toISOString(),
      href: `/calls/${c.id}`,
    })),
    ...messages.map((m) => ({
      ...MESSAGE_TITLES[m.channel],
      detail: firstLine(m.subject) || firstLine(m.summary) || m.ref,
      at: m.receivedAt.toISOString(),
      href: `/inbox?message=${m.id}`,
    })),
    ...documents.map((d) => ({
      kind: "document" as const,
      title: "Medical document read",
      detail: d.filename,
      at: d.createdAt.toISOString(),
      href: d.caseId ? `/cases/${d.caseId}` : "/documents",
    })),
    ...letters.map((l) => ({
      kind: "letter" as const,
      title: "Letter of Guarantee sent",
      detail: `${l.ref} · ${l.hospitalName}`,
      at: l.sentAt!.toISOString(),
      href: `/cases/${l.caseId}`,
    })),
    ...claims.map((c) => ({
      kind: "claim" as const,
      title: "Claim pack checked",
      detail: firstLine(c.summary) || c.ref,
      at: c.createdAt.toISOString(),
      href: `/claims/${c.ref}`,
    })),
  ];
  // The newest of each kind first, so a burst of one kind (a batch of documents) doesn't fill the list.
  items.sort((a, b) => b.at.localeCompare(a.at));
  const seen = new Set<string>();
  const leaders = items.filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true)));
  const rest = items.filter((i) => !leaders.includes(i));
  return [...leaders, ...rest].slice(0, limit).sort((a, b) => b.at.localeCompare(a.at));
}

/** The cases opened most recently. */
export async function getRecentCases(limit = 4, now = new Date()): Promise<RecentCase[]> {
  const cases = await prisma.case.findMany({
    where: { createdAt: { lte: now } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, ref: true, title: true, status: true, createdAt: true, patient: { select: { firstName: true, lastName: true } } },
  });
  return cases.map((c) => ({
    id: c.id,
    ref: c.ref,
    title: c.title,
    status: c.status,
    patient: `${c.patient.firstName} ${c.patient.lastName}`.trim(),
    at: c.createdAt.toISOString(),
  }));
}
