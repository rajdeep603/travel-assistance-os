// ---------------------------------------------------------------------------
// The dashboard's activity series, shared by the server (counting, in
// services/dashboard.ts) and the browser (the chart): names, colours and the
// arithmetic on them, with nothing that touches the database.
// ---------------------------------------------------------------------------

/** The series in the order they stack on the chart (bottom first). */
export const ACTIVITY_SERIES = ["cases", "messages", "claims", "calls"] as const;
export type ActivitySeries = (typeof ACTIVITY_SERIES)[number];
export type ActivityCounts = Record<ActivitySeries, number>;

export interface ActivityBucket extends ActivityCounts {
  /** When the bucket starts and ends (ISO), for labels and the tooltip. */
  start: string;
  end: string;
}

export interface Activity {
  days: number;
  /** Days per bucket: one for 7 and 30 days, three for 90. */
  bucketDays: number;
  buckets: ActivityBucket[];
  totals: ActivityCounts;
  /** The same counts for the period just before, for the trend. */
  previous: ActivityCounts;
  /** The counts in the last 7 days (the last 24 hours for a 7-day period): the trend when there is nothing before. */
  recent: ActivityCounts;
}

/** One colour per series, the same on the cards and the chart (validated for colour-blind separation in this stack order). */
export const SERIES_COLORS: Record<ActivitySeries, string> = {
  cases: "#2563eb",
  messages: "#f59e0b",
  claims: "#a855f7",
  calls: "#10b981",
};

export const SERIES_LABELS: Record<ActivitySeries, string> = {
  cases: "Cases opened",
  messages: "E-mails & faxes read",
  claims: "Claims checked",
  calls: "AI calls handled",
};

export const emptyCounts = (): ActivityCounts => ({ cases: 0, messages: 0, claims: 0, calls: 0 });

/** The change against the period before as a share (0.12 = +12%); null when there was nothing before. */
export function trendShare(current: number, before: number): number | null {
  return before > 0 ? (current - before) / before : null;
}

/** Running totals across the buckets: a card's sparkline. */
export function runningTotals(buckets: ActivityBucket[], series: ActivitySeries): number[] {
  let sum = 0;
  return buckets.map((b) => (sum += b[series]));
}
