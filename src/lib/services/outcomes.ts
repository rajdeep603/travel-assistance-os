import { prisma } from "@/lib/db";
import { LANGUAGE_NAMES } from "@/lib/intake/language";
import { INTERPRETER_LANGUAGES } from "@/lib/voice/interpreter-prompt";

// ---------------------------------------------------------------------------
// Outcome figures for the executive overview: what the AI actually did over
// a recent window, computed from the records (calls, inbox, letters,
// documents) — never estimated.
// ---------------------------------------------------------------------------

export interface Outcomes {
  days: number;
  calls: { ended: number; byAi: number; transferred: number; aiShare: number | null; answerSeconds: number | null };
  inbox: { received: number; automated: number; automatedShare: number | null; replyMinutes: number | null };
  letters: { sent: number; turnaroundMinutes: number | null };
  documents: { read: number; avgConfidence: number | null };
  languages: string[];
}

export function median(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 42 → "42 s", 660 → "11 min", 9000 → "2.5 h", 259200 → "3 days". */
export function formatShortDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 36) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round(hours / 24)} days`;
}

const NAMES: Record<string, string> = { ...INTERPRETER_LANGUAGES, ...LANGUAGE_NAMES };

/** "tr" → "Turkish"; "English ⇄ Hindi" → both; unknown values are kept as written. */
export function languageNames(values: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    for (const part of (value ?? "").split("⇄")) {
      const v = part.trim();
      if (!v) continue;
      const name = NAMES[v] ?? NAMES[v.toLowerCase()] ?? NAMES[v.toLowerCase().split("-")[0]] ?? v;
      out.add(name.charAt(0).toUpperCase() + name.slice(1));
    }
  }
  // English first, then by name.
  return [...out].sort((a, b) => (a === "English" ? -1 : b === "English" ? 1 : a.localeCompare(b)));
}

const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const plausible = (ms: number, maxMs: number) => ms >= 0 && ms <= maxMs;

export async function getOutcomes(days = 30, now = new Date()): Promise<Outcomes> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const [calls, inbound, replies, letters, documents, confidence] = await Promise.all([
    prisma.call.findMany({
      where: { createdAt: { gte: since }, status: { in: ["COMPLETED", "TRANSFERRED", "VOICEMAIL", "FAILED"] } },
      select: { status: true, channel: true, direction: true, language: true, startedAt: true, answeredAt: true },
    }),
    prisma.inboundMessage.findMany({ where: { receivedAt: { gte: since } }, select: { status: true, language: true } }),
    prisma.outboundMessage.findMany({
      where: { automatic: true, sentAt: { not: null }, inReplyTo: { receivedAt: { gte: since } } },
      select: { sentAt: true, inReplyTo: { select: { receivedAt: true } } },
    }),
    prisma.guaranteeLetter.findMany({
      where: { sentAt: { gte: since } },
      select: { sentAt: true, createdAt: true, estimateDocumentId: true },
    }),
    prisma.document.count({ where: { status: "PROCESSED", createdAt: { gte: since } } }),
    prisma.documentExtraction.aggregate({ _avg: { confidence: true }, where: { document: { createdAt: { gte: since } } } }),
  ]);

  const byAi = calls.filter((c) => c.status === "COMPLETED" || c.status === "VOICEMAIL").length;
  const transferred = calls.filter((c) => c.status === "TRANSFERRED").length;
  const answerTimes = calls
    .filter((c) => c.channel === "PHONE" && c.direction === "INBOUND" && c.answeredAt)
    .map((c) => c.answeredAt!.getTime() - c.startedAt.getTime())
    .filter((ms) => plausible(ms, 5 * 60_000));

  const automated = inbound.filter((m) => m.status === "REPLIED" || m.status === "MATCHED").length;
  const replyTimes = replies
    .map((r) => r.sentAt!.getTime() - (r.inReplyTo?.receivedAt.getTime() ?? NaN))
    .filter((ms) => plausible(ms, 7 * 24 * 3_600_000));

  const estimates = await prisma.document.findMany({
    where: { id: { in: letters.map((l) => l.estimateDocumentId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, createdAt: true },
  });
  const estimateAt = new Map(estimates.map((d) => [d.id, d.createdAt]));
  const letterTimes = letters
    .map((l) => l.sentAt!.getTime() - (estimateAt.get(l.estimateDocumentId ?? "") ?? l.createdAt).getTime())
    .filter((ms) => plausible(ms, 14 * 24 * 3_600_000));

  const answerMs = median(answerTimes);
  const replyMs = median(replyTimes);
  const letterMs = median(letterTimes);
  return {
    days,
    calls: {
      ended: calls.length,
      byAi,
      transferred,
      aiShare: share(byAi, calls.length),
      answerSeconds: answerMs == null ? null : answerMs / 1000,
    },
    inbox: {
      received: inbound.length,
      automated,
      automatedShare: share(automated, inbound.length),
      replyMinutes: replyMs == null ? null : replyMs / 60_000,
    },
    letters: { sent: letters.length, turnaroundMinutes: letterMs == null ? null : letterMs / 60_000 },
    documents: { read: documents, avgConfidence: confidence._avg.confidence },
    languages: languageNames([...calls.map((c) => c.language), ...inbound.map((m) => m.language)]),
  };
}
