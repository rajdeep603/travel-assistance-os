// ---------------------------------------------------------------------------
// Operational clock. Provider slots, "today"/"tomorrow" and bookings are all
// Istanbul wall-clock times; the database stores UTC instants. Every
// conversion between the two goes through this module so the result never
// depends on the host's timezone (containers run in UTC, laptops don't).
// ---------------------------------------------------------------------------

export const DEMO_TIME_ZONE = "Europe/Istanbul";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekdayKey = (typeof WEEKDAYS)[number];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (n: number) => String(n).padStart(2, "0");

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DEMO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(instant: Date): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(instant)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as unknown as ZonedParts;
}

/** Offset of the demo timezone from UTC at `instant`, in milliseconds. */
function zoneOffsetMs(instant: Date): number {
  const p = zonedParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (instant.getTime() - instant.getMilliseconds());
}

export function isValidDate(date: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time);
}

/** Istanbul wall-clock date + time → the UTC instant it denotes. */
export function zonedToUtc(date: string, time: string): Date {
  if (!isValidDate(date) || !isValidTime(time)) return new Date(NaN);
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset even across a DST boundary.
  let instant = guess - zoneOffsetMs(new Date(guess));
  instant = guess - zoneOffsetMs(new Date(instant));
  return new Date(instant);
}

/** UTC instant → Istanbul wall-clock { date: "YYYY-MM-DD", time: "HH:MM" }. */
export function utcToZoned(instant: Date): { date: string; time: string } {
  const p = zonedParts(instant);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** Calendar arithmetic on plain dates (no timezone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Today's date in Istanbul, optionally shifted by whole days. */
export function zonedToday(offsetDays = 0, now = new Date()): string {
  return addDays(utcToZoned(now).date, offsetDays);
}

/** Current Istanbul wall-clock time, "HH:MM". */
export function zonedNowTime(now = new Date()): string {
  return utcToZoned(now).time;
}

/** Weekday of a plain date: 0 = Sunday … 6 = Saturday. */
export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayKey(date: string): WeekdayKey {
  return WEEKDAYS[weekdayIndex(date)];
}

/** UTC bounds [start, end) of an Istanbul calendar day. */
export function zonedDayRange(date: string): { start: Date; end: Date } {
  return { start: zonedToUtc(date, "00:00"), end: zonedToUtc(addDays(date, 1), "00:00") };
}

/** Whole days from Istanbul-today to `date` (negative = past). */
export function daysFromToday(date: string, now = new Date()): number {
  const [y1, m1, d1] = zonedToday(0, now).split("-").map(Number);
  const [y2, m2, d2] = date.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** True when the Istanbul slot has already started. */
export function isPastSlot(date: string, time: string, now = new Date()): boolean {
  return zonedToUtc(date, time).getTime() <= now.getTime();
}

/** "2026-10-03" → e.g. "Fri 3 Oct" (or the given Intl options). */
export function formatPlainDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }
): string {
  if (!isValidDate(date)) return date;
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d, 12))
  );
}
