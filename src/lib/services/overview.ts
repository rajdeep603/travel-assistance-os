import { prisma } from "@/lib/db";
import { getOutcomes, type Outcomes } from "./outcomes";
import { getMoneyOutcomes, type MoneyOutcomes } from "./exposure";
import { getShiftHandover, type ShiftHandover } from "./shift-handover";

// ---------------------------------------------------------------------------
// The overview's figures: what the dashboard shows and what the operations
// summary PDF prints, from one place so the two never disagree.
// ---------------------------------------------------------------------------

export const OVERVIEW_PERIODS = [7, 30, 90] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];
export const DEFAULT_OVERVIEW_PERIOD: OverviewPeriod = 30;

/** "7" | "30" | "90" from a query string, else the default. */
export function overviewDays(raw: unknown): OverviewPeriod {
  const n = Number(raw);
  return (OVERVIEW_PERIODS as readonly number[]).includes(n) ? (n as OverviewPeriod) : DEFAULT_OVERVIEW_PERIOD;
}

export const CASE_STATUS_ORDER = ["NEW", "IN_PROGRESS", "PENDING_INFO", "ESCALATED", "RESOLVED", "CLOSED"];
export const CLAIM_STATUS_ORDER = ["SUBMITTED", "PROCESSING", "NEEDS_REVIEW", "INFO_REQUESTED", "ESCALATED", "APPROVED", "REJECTED", "PAID"];
const OPEN_CASE = ["NEW", "IN_PROGRESS", "PENDING_INFO", "ESCALATED"];
const CLAIM_IN_REVIEW = ["SUBMITTED", "PROCESSING", "NEEDS_REVIEW", "INFO_REQUESTED", "ESCALATED"];

/** Something a person has to decide, with where to decide it. */
export interface OverviewDecision {
  count: number;
  label: string;
  href: string;
}

export interface Overview {
  days: OverviewPeriod;
  caseCounts: Record<string, number>;
  claimCounts: Record<string, number>;
  openCases: number;
  claimsInReview: number;
  upcomingAppointments: number;
  documentsProcessed: number;
  decisions: OverviewDecision[];
  /** Where the first bill review waiting for a decision is. */
  reviewHref: string;
  outcomes: Outcomes;
  money: MoneyOutcomes;
  handover: ShiftHandover | null;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export async function getOverview({ days = DEFAULT_OVERVIEW_PERIOD, night = null }: { days?: OverviewPeriod; night?: string | null } = {}): Promise<Overview> {
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
      getOutcomes(days, now),
      getMoneyOutcomes(days, now),
      getShiftHandover({ night }),
    ]);
  const caseCounts = Object.fromEntries(casesByStatus.map((g) => [g.status, g._count._all])) as Record<string, number>;
  const claimCounts = Object.fromEntries(claimsByStatus.map((g) => [g.status, g._count._all])) as Record<string, number>;
  const sum = (counts: Record<string, number>, keys: string[]) => keys.reduce((total, k) => total + (counts[k] ?? 0), 0);
  // Each decision opens the record to decide on when there is one.
  const reviewHref = proposedReview?.caseId ? `/cases/${proposedReview.caseId}` : proposedReview?.claim ? `/claims/${proposedReview.claim.ref}` : "/claims";
  const decisions: OverviewDecision[] = [
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
    days,
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
}
