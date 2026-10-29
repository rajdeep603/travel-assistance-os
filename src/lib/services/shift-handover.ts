import { prisma } from "@/lib/db";
import { addDays, utcToZoned, zonedToUtc } from "@/lib/time";
import { INTERNAL_AGENT_IDS } from "@/lib/voice/agents/ids";
import { getAgent } from "@/lib/voice/agents/registry";
import { languageNames } from "./outcomes";

// ---------------------------------------------------------------------------
// The night-shift handover: what the AI handled between 20:00 and 08:00
// Istanbul time, and what it left for the morning shift. Computed from
// the records of one night, which is always named by its date: the overview
// never presents an older night as last night.
// ---------------------------------------------------------------------------

export const SHIFT_START = "20:00";
export const SHIFT_END = "08:00";
/** How far back the night picker looks. */
const LOOKBACK_DAYS = 21;

export interface HandoverEvent {
  at: Date;
  kind: "call" | "case" | "letter" | "message";
  title: string;
  detail: string | null;
  href: string;
  /** Emergencies first in the eye; "person" when a person has to act. */
  tone: "emergency" | "ai" | "person";
}

export interface ShiftHandover {
  /** YYYY-MM-DD of the evening the shift started. */
  night: string;
  start: Date;
  end: Date;
  /** The shift hasn't ended yet. */
  inProgress: boolean;
  calls: { total: number; byAi: number; transferred: number; emergencies: number; languages: string[] };
  inbox: { received: number; automated: number; needsReview: number };
  cases: { opened: number; critical: number };
  lettersSent: number;
  /** The night's notable moments, in order. */
  events: HandoverEvent[];
  /** Nights with activity, newest first, for the picker. */
  nights: { night: string; activity: number }[];
}

/** The shift a moment falls in ("2026-10-15" for 03:10 on the 16th), or null in the day. */
export function nightOf(instant: Date): string | null {
  const { date, time } = utcToZoned(instant);
  if (time >= SHIFT_START) return date;
  if (time < SHIFT_END) return addDays(date, -1);
  return null;
}

export function shiftWindow(night: string): { start: Date; end: Date } {
  return { start: zonedToUtc(night, SHIFT_START), end: zonedToUtc(addDays(night, 1), SHIFT_END) };
}

const CALL_DONE = ["COMPLETED", "TRANSFERRED", "VOICEMAIL", "FAILED"] as const;

async function activeNights(now: Date): Promise<{ night: string; activity: number }[]> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 3_600_000);
  const [calls, messages, cases, letters] = await Promise.all([
    prisma.call.findMany({ where: { startedAt: { gte: since, lte: now }, agentProfile: { notIn: INTERNAL_AGENT_IDS } }, select: { startedAt: true } }),
    prisma.inboundMessage.findMany({ where: { receivedAt: { gte: since, lte: now } }, select: { receivedAt: true } }),
    prisma.case.findMany({ where: { createdAt: { gte: since, lte: now } }, select: { createdAt: true } }),
    prisma.guaranteeLetter.findMany({ where: { sentAt: { gte: since, lte: now } }, select: { sentAt: true } }),
  ]);
  const counts = new Map<string, number>();
  for (const at of [...calls.map((c) => c.startedAt), ...messages.map((m) => m.receivedAt), ...cases.map((c) => c.createdAt), ...letters.map((l) => l.sentAt!)]) {
    const night = nightOf(at);
    if (night) counts.set(night, (counts.get(night) ?? 0) + 1);
  }
  return [...counts].map(([night, activity]) => ({ night, activity })).sort((a, b) => b.night.localeCompare(a.night));
}

const agentLabel = (id: string) => getAgent(id)?.label ?? id;

/**
 * One night's handover: the night asked for, or else the busiest recent night
 * (the latest of equals), so a quiet night with one test call doesn't hide
 * what a full shift looks like. The panel always names the night's date.
 */
export async function getShiftHandover(opts: { night?: string | null; now?: Date } = {}): Promise<ShiftHandover | null> {
  const now = opts.now ?? new Date();
  const nights = await activeNights(now);
  const busiest = nights.reduce<(typeof nights)[number] | undefined>((best, n) => (!best || n.activity > best.activity ? n : best), undefined);
  const night = opts.night && nights.some((n) => n.night === opts.night) ? opts.night : busiest?.night;
  if (!night) return null;
  const { start, end } = shiftWindow(night);
  const window = { gte: start, lt: end };

  const [calls, messages, cases, letters] = await Promise.all([
    prisma.call.findMany({
      where: { startedAt: window, status: { in: [...CALL_DONE] }, agentProfile: { notIn: INTERNAL_AGENT_IDS } },
      orderBy: { startedAt: "asc" },
      select: { id: true, ref: true, status: true, agentProfile: true, language: true, startedAt: true, transferredTo: true, summary: true },
    }),
    prisma.inboundMessage.findMany({
      where: { receivedAt: window },
      orderBy: { receivedAt: "asc" },
      select: { id: true, ref: true, channel: true, status: true, language: true, receivedAt: true, subject: true, summary: true },
    }),
    prisma.case.findMany({
      where: { createdAt: window },
      orderBy: { createdAt: "asc" },
      select: { id: true, ref: true, title: true, priority: true, createdAt: true },
    }),
    prisma.guaranteeLetter.findMany({
      where: { sentAt: window },
      orderBy: { sentAt: "asc" },
      select: { ref: true, caseId: true, hospitalName: true, guaranteedAmount: true, currency: true, sentAt: true },
    }),
  ]);

  const emergencies = calls.filter((c) => c.status === "TRANSFERRED" && c.transferredTo === "doctor");
  const events: HandoverEvent[] = [
    ...calls.map((c): HandoverEvent => {
      const emergency = c.status === "TRANSFERRED" && c.transferredTo === "doctor";
      return {
        at: c.startedAt,
        kind: "call",
        title: emergency
          ? `Emergency call put through to the on-call doctor (${c.ref})`
          : c.status === "TRANSFERRED"
            ? `${agentLabel(c.agentProfile)}: handed to a case manager (${c.ref})`
            : `${agentLabel(c.agentProfile)}: handled by AI (${c.ref})`,
        detail: c.summary,
        href: `/calls/${c.id}`,
        tone: emergency ? "emergency" : c.status === "TRANSFERRED" ? "person" : "ai",
      };
    }),
    ...messages.map(
      (m): HandoverEvent => ({
        at: m.receivedAt,
        kind: "message",
        title: `${m.channel === "FAX" ? "Fax" : "E-mail"} ${m.ref}${m.subject ? `: ${m.subject}` : ""}`,
        detail: m.summary,
        href: `/inbox?message=${m.id}`,
        tone: m.status === "NEEDS_REVIEW" ? "person" : "ai",
      })
    ),
    ...cases.map(
      (c): HandoverEvent => ({
        at: c.createdAt,
        kind: "case",
        title: `${c.priority === "CRITICAL" ? "Critical case" : "Case"} ${c.ref} opened: ${c.title}`,
        detail: null,
        href: `/cases/${c.id}`,
        tone: c.priority === "CRITICAL" ? "emergency" : "ai",
      })
    ),
    ...letters.map(
      (l): HandoverEvent => ({
        at: l.sentAt!,
        kind: "letter",
        title: `Letter of Guarantee ${l.ref} sent to ${l.hospitalName}`,
        detail: `${Number(l.guaranteedAmount).toLocaleString("en-GB")} ${l.currency} guaranteed`,
        href: `/cases/${l.caseId}`,
        tone: "ai",
      })
    ),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    night,
    start,
    end,
    inProgress: now < end,
    calls: {
      total: calls.length,
      byAi: calls.filter((c) => c.status === "COMPLETED" || c.status === "VOICEMAIL").length,
      transferred: calls.filter((c) => c.status === "TRANSFERRED").length,
      emergencies: emergencies.length,
      languages: languageNames([...calls.map((c) => c.language), ...messages.map((m) => m.language)]),
    },
    inbox: {
      received: messages.length,
      automated: messages.filter((m) => m.status === "REPLIED" || m.status === "MATCHED").length,
      needsReview: messages.filter((m) => m.status === "NEEDS_REVIEW").length,
    },
    cases: { opened: cases.length, critical: cases.filter((c) => c.priority === "CRITICAL").length },
    lettersSent: letters.length,
    events,
    nights,
  };
}
