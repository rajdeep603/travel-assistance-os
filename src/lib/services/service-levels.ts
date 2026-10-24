import { prisma } from "@/lib/db";
import { caseServiceLevels, SLA_LABELS, type SlaKey, type SlaMilestone } from "@/lib/sla";
import { INTERNAL_AGENT_IDS } from "@/lib/voice/agents/ids";
import { median } from "./outcomes";

// ---------------------------------------------------------------------------
// The operation's service levels over a period: for each step, how often it
// was done within target and the median time, from the same per-case rules the
// case page shows (src/lib/sla.ts).
// ---------------------------------------------------------------------------

export interface ServiceLevel {
  key: SlaKey;
  label: string;
  targetSeconds: number;
  /** Done within target. */
  met: number;
  /** Done within target, done late, or still open past target. */
  total: number;
  /** Median time of the steps done; null when none were. */
  medianSeconds: number | null;
}

/** Everything a case's service levels are worked out from. */
export const SLA_CASE_SELECT = {
  createdAt: true,
  assistanceType: true,
  status: true,
  calls: { select: { ref: true, direction: true, startedAt: true, answeredAt: true } },
  guaranteeLetters: { select: { ref: true, status: true, createdAt: true, sentAt: true, estimateDocumentId: true } },
  events: { where: { type: "APPOINTMENT" as const }, select: { type: true, title: true, createdAt: true } },
};

type Letter = { ref: string; status: string; createdAt: Date; sentAt: Date | null; estimateDocumentId: string | null };

/** When each letter's cost estimate arrived (the clock starts at the hospital's request, as on the dashboard). */
async function withRequestTimes<L extends Letter>(letters: L[]): Promise<(L & { requestedAt: Date | null })[]> {
  const ids = letters.map((l) => l.estimateDocumentId).filter((id): id is string => !!id);
  const docs = ids.length ? await prisma.document.findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true } }) : [];
  const at = new Map(docs.map((d) => [d.id, d.createdAt]));
  return letters.map((l) => ({ ...l, requestedAt: (l.estimateDocumentId && at.get(l.estimateDocumentId)) || null }));
}

export async function slaInput(c: {
  createdAt: Date;
  assistanceType: string;
  status: string;
  calls: { ref: string; direction: string; startedAt: Date; answeredAt: Date | null }[];
  guaranteeLetters: Letter[];
  events: { type: string; title: string; createdAt: Date }[];
}) {
  return { openedAt: c.createdAt, assistanceType: c.assistanceType, status: c.status, calls: c.calls, letters: await withRequestTimes(c.guaranteeLetters), events: c.events };
}

export async function getServiceLevels(days = 30, now = new Date()): Promise<ServiceLevel[]> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const [calls, cases, letters] = await Promise.all([
    // Every call the AI answered in the period, not only the ones that opened a case.
    prisma.call.findMany({
      where: { direction: "INBOUND", startedAt: { gte: since, lte: now }, answeredAt: { not: null }, agentProfile: { notIn: INTERNAL_AGENT_IDS } },
      select: { ref: true, direction: true, startedAt: true, answeredAt: true },
    }),
    prisma.case.findMany({ where: { createdAt: { gte: since, lte: now } }, select: SLA_CASE_SELECT }),
    // Guarantees asked for in the period, whatever the case's age.
    prisma.guaranteeLetter.findMany({
      where: { createdAt: { gte: since, lte: now }, status: { not: "REJECTED" } },
      select: { ref: true, status: true, createdAt: true, sentAt: true, estimateDocumentId: true, case: { select: { status: true } } },
    }),
  ]);
  const caseInputs = await Promise.all(cases.map(slaInput));
  const timedLetters = await withRequestTimes(letters);

  const steps: SlaMilestone[] = [
    ...calls.flatMap((c) => caseServiceLevels({ openedAt: c.startedAt, assistanceType: "GENERAL", status: "RESOLVED", calls: [c], letters: [], events: [] }, now)),
    ...caseInputs.flatMap((c) => caseServiceLevels(c, now).filter((m) => m.key === "hospital" || m.key === "appointment")),
    ...timedLetters.flatMap((l) =>
      caseServiceLevels({ openedAt: l.createdAt, assistanceType: "GENERAL", status: l.case.status, calls: [], letters: [l], events: [] }, now).filter((m) => m.key === "guarantee")
    ),
  ];

  return (Object.keys(SLA_LABELS) as SlaKey[]).map((key) => {
    const mine = steps.filter((s) => s.key === key && s.state !== "running");
    return {
      key,
      label: SLA_LABELS[key].label,
      targetSeconds: SLA_LABELS[key].target,
      met: mine.filter((s) => s.state === "met").length,
      total: mine.length,
      medianSeconds: median(mine.filter((s) => s.state === "met" || s.state === "missed").map((s) => s.seconds)),
    };
  });
}
