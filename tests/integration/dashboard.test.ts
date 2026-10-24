import { describe, expect, it } from "vitest";
import { ACTIVITY_SERIES, runningTotals, trendShare } from "@/lib/dashboard-series";
import { formatTimeAgo } from "@/lib/format";
import { getActivity, getRecentActivity, getRecentCases } from "@/lib/services/dashboard";
import { getOutcomes } from "@/lib/services/outcomes";
import { getDecisions, getOverview } from "@/lib/services/overview";

// The dashboard's figures against the seeded database: the activity chart and
// its cards agree with the outcome figures, the latest records come newest
// first, and the header's bell lists the same decisions as the overview.

describe("dashboard activity", () => {
  it("counts the same calls and messages as the outcomes, bucket by bucket", async () => {
    const now = new Date();
    const [activity, outcomes] = await Promise.all([getActivity(30, now), getOutcomes(30, now)]);
    expect(activity.buckets).toHaveLength(30);
    expect(activity.totals.calls).toBe(outcomes.calls.byAi);
    expect(activity.totals.messages).toBe(outcomes.inbox.received);
    for (const series of ACTIVITY_SERIES) {
      // Every record in the period lands in exactly one bucket.
      expect(activity.buckets.reduce((sum, b) => sum + b[series], 0)).toBe(activity.totals[series]);
      expect(activity.recent[series]).toBeLessThanOrEqual(activity.totals[series]);
    }
    expect(activity.totals.cases).toBeGreaterThan(0);
    // Buckets run oldest to newest and end now.
    expect(activity.buckets.at(-1)!.end).toBe(now.toISOString());
    expect(activity.buckets[0].start < activity.buckets[1].start).toBe(true);
  });

  it("uses three-day buckets over 90 days", async () => {
    const activity = await getActivity(90);
    expect(activity.bucketDays).toBe(3);
    expect(activity.buckets).toHaveLength(30);
  });

  it("lists the latest work, newest first, one of each kind before repeats", async () => {
    const items = await getRecentActivity(4);
    expect(items.length).toBe(4);
    expect([...items].sort((a, b) => b.at.localeCompare(a.at))).toEqual(items);
    expect(new Set(items.map((i) => i.title)).size).toBe(4);
    for (const item of items) expect(item.href).toMatch(/^\/(calls|inbox|cases|claims|documents)/);

    const cases = await getRecentCases(4);
    expect(cases).toHaveLength(4);
    expect(cases[0].at >= cases[1].at).toBe(true);
    expect(cases[0].ref).toMatch(/^CASE-\d+$/);
  });

  it("gives the bell the same decisions as the overview", async () => {
    const [overview, decisions] = await Promise.all([getOverview({ days: 30 }), getDecisions({ days: 30 })]);
    expect(decisions).toEqual(overview.decisions);
    expect(decisions.some((d) => d.count > 0)).toBe(true);
  });
});

describe("dashboard arithmetic", () => {
  it("states the trend only when there was something before", () => {
    expect(trendShare(12, 10)).toBeCloseTo(0.2);
    expect(trendShare(5, 10)).toBeCloseTo(-0.5);
    expect(trendShare(5, 0)).toBeNull();
  });

  it("draws the sparkline from running totals", () => {
    const b = (cases: number) => ({ start: "", end: "", cases, messages: 0, claims: 0, calls: 0 });
    expect(runningTotals([b(1), b(0), b(2), b(3)], "cases")).toEqual([1, 1, 3, 6]);
  });

  it("says how long ago in the interface language", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    expect(formatTimeAgo("2026-10-24T11:59:30Z", "en-GB", now)).toBe("now");
    expect(formatTimeAgo("2026-10-24T11:50:00Z", "en-GB", now)).toBe("10 minutes ago");
    expect(formatTimeAgo("2026-10-24T09:00:00Z", "en-GB", now)).toBe("3 hours ago");
    expect(formatTimeAgo("2026-10-23T09:00:00Z", "en-GB", now)).toBe("yesterday");
    expect(formatTimeAgo("2026-10-24T09:00:00Z", "es", now)).toBe("hace 3 horas");
  });
});
