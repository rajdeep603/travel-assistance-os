import type { Provider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ACTIVE_CARE_PROVIDER, findDuplicates } from "./provider-network";
import { billsDirectly } from "./find-care";

// ---------------------------------------------------------------------------
// Network health: what is wrong with each provider record, how often across
// the network, and in what order it is worth fixing. A 0–100 score the team
// can watch move as validation calls land.
// ---------------------------------------------------------------------------

export type Severity = "high" | "medium" | "low";
export type IssueCode = "FLAGGED" | "STALE" | "MISSING_PHONE" | "MISSING_EMAIL" | "DUPLICATE" | "MISSING_HOURS" | "BILLING_UNKNOWN" | "NO_PRICES" | "NO_ACCREDITATION";

export interface Issue {
  code: IssueCode;
  severity: Severity;
  text: string;
}

export const ISSUE_LABELS: Record<IssueCode, string> = {
  FLAGGED: "Closed, moved or unreachable",
  STALE: "Not verified in over a year",
  MISSING_PHONE: "No phone number",
  MISSING_EMAIL: "No e-mail",
  DUPLICATE: "Likely duplicate",
  MISSING_HOURS: "Opening hours unknown",
  BILLING_UNKNOWN: "Direct billing unknown",
  NO_PRICES: "No prices on file",
  NO_ACCREDITATION: "No accreditation on file",
};

const WEIGHT: Record<Severity, number> = { high: 6, medium: 3, low: 1 };
const YEAR = 365 * 86400000;

export function providerIssues(p: Provider & { _count?: { prices: number } }, opts: { duplicate?: boolean; now?: Date } = {}): Issue[] {
  const now = opts.now ?? new Date();
  const out: Issue[] = [];
  if (p.status === "CLOSED" || p.status === "MOVED" || p.status === "UNREACHABLE") {
    out.push({ code: "FLAGGED", severity: "high", text: p.status === "CLOSED" ? "Closed" : p.status === "MOVED" ? "Moved" : "Not reachable by phone" });
  }
  if (opts.duplicate) out.push({ code: "DUPLICATE", severity: "medium", text: "Looks like another record" });
  if (!p.lastVerifiedAt || now.getTime() - p.lastVerifiedAt.getTime() > YEAR) {
    out.push({ code: "STALE", severity: "medium", text: p.lastVerifiedAt ? `Last verified ${p.lastVerifiedAt.toISOString().slice(0, 10)}` : "Never verified" });
  }
  if (!p.phone) out.push({ code: "MISSING_PHONE", severity: "medium", text: "No phone number" });
  if (!p.email) out.push({ code: "MISSING_EMAIL", severity: "low", text: "No e-mail" });
  if (!p.hours && p.kind !== "TELEMEDICINE") out.push({ code: "MISSING_HOURS", severity: "low", text: "Hours not confirmed" });
  if (billsDirectly(p) == null) out.push({ code: "BILLING_UNKNOWN", severity: "low", text: "Direct billing unknown" });
  if (!(p._count?.prices ?? 0)) out.push({ code: "NO_PRICES", severity: "low", text: "No prices" });
  if (!p.accreditations.length && p.kind === "HOSPITAL") out.push({ code: "NO_ACCREDITATION", severity: "low", text: "No accreditation" });
  return out;
}

export interface HealthReport {
  score: number;
  total: number;
  clean: number;
  verified: number;
  counts: { code: IssueCode; label: string; severity: Severity; count: number }[];
  queue: { id: string; ref: string; name: string; facility: string; city: string; status: string; weight: number; issues: Issue[] }[];
}

/** The order issues are listed in, worst first. */
const ORDER: IssueCode[] = ["FLAGGED", "DUPLICATE", "STALE", "MISSING_PHONE", "MISSING_HOURS", "BILLING_UNKNOWN", "MISSING_EMAIL", "NO_PRICES", "NO_ACCREDITATION"];

export async function healthReport(now = new Date()): Promise<HealthReport> {
  const providers = await prisma.provider.findMany({ where: ACTIVE_CARE_PROVIDER, include: { _count: { select: { prices: true } } } });
  const pairs = await findDuplicates();
  const duplicateIds = new Set(pairs.flatMap((pair) => [pair.a.id, pair.b.id]));
  const perProvider = providers.map((p) => {
    const issues = providerIssues(p, { duplicate: duplicateIds.has(p.id), now });
    const weight = Math.min(10, issues.reduce((n, i) => n + WEIGHT[i.severity], 0));
    return { p, issues, weight };
  });
  const total = providers.length;
  const penalty = perProvider.reduce((n, x) => n + x.weight, 0);
  const score = total ? Math.max(0, Math.round(100 - (penalty / (10 * total)) * 100)) : 100;
  const counts = ORDER.map((code) => ({
    code,
    label: ISSUE_LABELS[code],
    severity: perProvider.flatMap((x) => x.issues).find((i) => i.code === code)?.severity ?? (code === "FLAGGED" ? "high" : code === "STALE" || code === "DUPLICATE" || code === "MISSING_PHONE" ? "medium" : "low"),
    count: perProvider.filter((x) => x.issues.some((i) => i.code === code)).length,
  })).filter((c) => c.count > 0);
  const queue = perProvider
    .filter((x) => x.issues.length)
    .sort((a, b) => b.weight - a.weight || a.p.facility.localeCompare(b.p.facility))
    .slice(0, 12)
    .map(({ p, issues, weight }) => ({ id: p.id, ref: p.ref, name: p.name, facility: p.facility, city: p.city, status: p.status, weight, issues }));
  return { score, total, clean: perProvider.filter((x) => !x.issues.length).length, verified: providers.filter((p) => p.status === "VERIFIED").length, counts, queue };
}
