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
  const { decisions, reviewHref } = decisionsFrom({
    awaitingDecision: money.awaitingDecision,
    draftLetterCases: draftLetters.map((l) => l.caseId),
    proposedReview,
    escalatedCaseId: escalatedCase?.id ?? null,
    claimsToReview: claimCounts.NEEDS_REVIEW ?? 0,
    escalated: caseCounts.ESCALATED ?? 0,
    pendingInfo: caseCounts.PENDING_INFO ?? 0,
  });
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

interface DecisionInputs {
  awaitingDecision: number;
  draftLetterCases: string[];
  proposedReview: { caseId: string | null; claim: { ref: string } | null } | null;
  escalatedCaseId: string | null;
  claimsToReview: number;
  escalated: number;
  pendingInfo: number;
}

/** The decisions waiting for a person; each opens the record to decide on when there is one. */
function decisionsFrom(d: DecisionInputs): { decisions: OverviewDecision[]; reviewHref: string } {
  const reviewHref = d.proposedReview?.caseId ? `/cases/${d.proposedReview.caseId}` : d.proposedReview?.claim ? `/claims/${d.proposedReview.claim.ref}` : "/claims";
  const decisions: OverviewDecision[] = [
    { count: d.awaitingDecision, label: plural(d.awaitingDecision, "hospital bill review to accept", "hospital bill reviews to accept"), href: reviewHref },
    {
      count: d.draftLetterCases.length,
      label: plural(d.draftLetterCases.length, "guarantee letter to approve", "guarantee letters to approve"),
      href: d.draftLetterCases[0] ? `/cases/${d.draftLetterCases[0]}` : "/cases",
    },
    { count: d.claimsToReview, label: plural(d.claimsToReview, "claim to review", "claims to review"), href: "/claims" },
    { count: d.escalated, label: plural(d.escalated, "escalated case", "escalated cases"), href: d.escalatedCaseId ? `/cases/${d.escalatedCaseId}` : "/cases" },
    { count: d.pendingInfo, label: plural(d.pendingInfo, "case waiting for information", "cases waiting for information"), href: "/cases" },
  ];
  return { decisions, reviewHref };
}

/** Only the decisions waiting for a person (the header's bell), without the rest of the overview. */
export async function getDecisions({ days = DEFAULT_OVERVIEW_PERIOD, now = new Date() }: { days?: OverviewPeriod; now?: Date } = {}): Promise<OverviewDecision[]> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const [cases, claimsToReview, draftLetters, proposedReview, escalatedCase, reviews] = await Promise.all([
    prisma.case.groupBy({ by: ["status"], where: { status: { in: ["ESCALATED", "PENDING_INFO"] } }, _count: { _all: true } }),
    prisma.claim.count({ where: { status: "NEEDS_REVIEW" } }),
    prisma.guaranteeLetter.findMany({ where: { status: "DRAFT" }, orderBy: { createdAt: "desc" }, select: { caseId: true } }),
    prisma.billReview.findFirst({
      where: { status: "PROPOSED" },
      orderBy: { createdAt: "desc" },
      select: { caseId: true, claim: { select: { ref: true } } },
    }),
    prisma.case.findFirst({ where: { status: "ESCALATED" }, orderBy: { updatedAt: "desc" }, select: { id: true } }),
    // As getMoneyOutcomes counts them: hospital invoices reviewed in the period, proposed with a saving.
    prisma.billReview.findMany({ where: { kind: "HOSPITAL_INVOICE", createdAt: { gte: since }, status: "PROPOSED" }, select: { savings: true } }),
  ]);
  const byStatus = Object.fromEntries(cases.map((g) => [g.status, g._count._all])) as Record<string, number>;
  return decisionsFrom({
    awaitingDecision: reviews.filter((r) => Number(r.savings) > 0).length,
    draftLetterCases: draftLetters.map((l) => l.caseId),
    proposedReview,
    escalatedCaseId: escalatedCase?.id ?? null,
    claimsToReview,
    escalated: byStatus.ESCALATED ?? 0,
    pendingInfo: byStatus.PENDING_INFO ?? 0,
  }).decisions;
}
