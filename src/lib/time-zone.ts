import { DEMO_TIME_ZONE, isValidDate, isValidTime } from "./time";

// ---------------------------------------------------------------------------
// The display time zone: the clock every date and time on screen is shown in.
// The operation runs on Istanbul time (src/lib/time.ts: slots, shifts,
// "today"); a viewer in Singapore, London or New York switches the display to
// their own clock from the header, and the choice is kept in a cookie so the
// server renders with it too. Business rules never read this.
// ---------------------------------------------------------------------------

export const OPERATION_TIME_ZONE = DEMO_TIME_ZONE;
export const TIME_ZONE_COOKIE = "caretrail-tz";
/** Fired on window when the display zone changes. */
export const TIME_ZONE_EVENT = "caretrail:time-zone";

export interface TimeZoneOption {
  id: string;
  /** The city or region a buyer would say. */
  label: string;
  region: "Operation" | "Europe" | "Middle East & Africa" | "Asia & Pacific" | "Americas" | "UTC";
}

export const TIME_ZONES: readonly TimeZoneOption[] = [
  { id: "Europe/Istanbul", label: "Istanbul", region: "Operation" },
  { id: "Europe/London", label: "London", region: "Europe" },
  { id: "Europe/Dublin", label: "Dublin", region: "Europe" },
  { id: "Europe/Lisbon", label: "Lisbon", region: "Europe" },
  { id: "Europe/Madrid", label: "Madrid", region: "Europe" },
  { id: "Europe/Paris", label: "Paris", region: "Europe" },
  { id: "Europe/Berlin", label: "Berlin", region: "Europe" },
  { id: "Europe/Amsterdam", label: "Amsterdam", region: "Europe" },
  { id: "Europe/Zurich", label: "Zurich", region: "Europe" },
  { id: "Europe/Rome", label: "Rome", region: "Europe" },
  { id: "Europe/Stockholm", label: "Stockholm", region: "Europe" },
  { id: "Europe/Warsaw", label: "Warsaw", region: "Europe" },
  { id: "Europe/Athens", label: "Athens", region: "Europe" },
  { id: "Europe/Bucharest", label: "Bucharest", region: "Europe" },
  { id: "Europe/Moscow", label: "Moscow", region: "Europe" },
  { id: "Asia/Dubai", label: "Dubai", region: "Middle East & Africa" },
  { id: "Asia/Riyadh", label: "Riyadh", region: "Middle East & Africa" },
  { id: "Africa/Johannesburg", label: "Johannesburg", region: "Middle East & Africa" },
  { id: "Africa/Cairo", label: "Cairo", region: "Middle East & Africa" },
  { id: "Asia/Kolkata", label: "India", region: "Asia & Pacific" },
  { id: "Asia/Bangkok", label: "Bangkok", region: "Asia & Pacific" },
  { id: "Asia/Singapore", label: "Singapore", region: "Asia & Pacific" },
  { id: "Asia/Hong_Kong", label: "Hong Kong", region: "Asia & Pacific" },
  { id: "Asia/Shanghai", label: "Shanghai", region: "Asia & Pacific" },
  { id: "Asia/Tokyo", label: "Tokyo", region: "Asia & Pacific" },
  { id: "Australia/Sydney", label: "Sydney", region: "Asia & Pacific" },
  { id: "Pacific/Auckland", label: "Auckland", region: "Asia & Pacific" },
  { id: "America/Sao_Paulo", label: "São Paulo", region: "Americas" },
  { id: "America/New_York", label: "New York", region: "Americas" },
  { id: "America/Toronto", label: "Toronto", region: "Americas" },
  { id: "America/Chicago", label: "Chicago", region: "Americas" },
  { id: "America/Denver", label: "Denver", region: "Americas" },
  { id: "America/Los_Angeles", label: "Los Angeles", region: "Americas" },
  { id: "America/Mexico_City", label: "Mexico City", region: "Americas" },
  { id: "UTC", label: "UTC", region: "UTC" },
];

export const TIME_ZONE_REGIONS: readonly TimeZoneOption["region"][] = ["Operation", "Europe", "Middle East & Africa", "Asia & Pacific", "Americas", "UTC"];

/** Any IANA zone the runtime knows; the list above is what the switch offers. */
export function isTimeZone(id: unknown): id is string {
  if (typeof id !== "string" || !id || id.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

export function timeZoneLabel(id: string): string {
  return TIME_ZONES.find((z) => z.id === id)?.label ?? id.split("/").pop()?.replace(/_/g, " ") ?? id;
}

/** "02:14" in the zone, right now. */
export function timeZoneClock(id: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: id }).format(now);
}

/** "UTC+3", "UTC−5", "UTC+5:30". */
export function timeZoneOffset(id: string, now: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-GB", { timeZone: id, timeZoneName: "longOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value;
  if (!part || /^GMT([+-]00:00)?$/.test(part)) return "UTC";
  return part
    .replace(/^GMT/, "UTC")
    .replace("-", "−")
    .replace(/:00$/, "")
    .replace(/([+−])0(\d)/, "$1$2");
}

const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

/** The date and time a clock in `zone` shows at `instant`, as numbers. */
function wallClockParts(instant: Date, zone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  let formatter = wallClockFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    wallClockFormatters.set(zone, formatter);
  }
  const out: Record<string, number> = {};
  for (const p of formatter.formatToParts(instant)) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out as ReturnType<typeof wallClockParts>;
}

/** UTC instant → what a clock in `zone` shows: { date: "YYYY-MM-DD", time: "HH:MM" }. */
export function utcToWallClock(instant: Date, zone: string): { date: string; time: string } {
  const p = wallClockParts(instant, zone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/**
 * A date and time on a clock in `zone` → the UTC instant it denotes; an
 * invalid Date for a malformed date, time or zone. A time skipped by a
 * daylight-saving change lands an hour on, as calendars do.
 */
export function wallClockToUtc(date: string, time: string, zone: string): Date {
  if (!isValidDate(date) || !isValidTime(time) || !isTimeZone(zone)) return new Date(NaN);
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (at: number) => {
    const p = wallClockParts(new Date(at), zone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000;
  };
  const first = guess - offset(guess);
  const second = guess - offset(first);
  if (first === second) return new Date(first);
  // Around a change the two offsets differ: the one whose clock shows the
  // time asked for wins; a time the change skipped takes the later instant.
  const shows = (at: number) => {
    const w = utcToWallClock(new Date(at), zone);
    return w.date === date && w.time === time;
  };
  return new Date(shows(second) ? second : shows(first) ? first : Math.max(first, second));
}

/** The cookie's value from a Cookie header or document.cookie string, if it names a zone. */
export function timeZoneFromCookie(cookie: string | null | undefined): string | null {
  const m = cookie?.match(new RegExp(`(?:^|;\\s*)${TIME_ZONE_COOKIE}=([^;]*)`));
  if (!m) return null;
  try {
    const value = decodeURIComponent(m[1]);
    return isTimeZone(value) ? value : null;
  } catch {
    return null;
  }
}

// The zone in effect for formatting. Server components pass the request's
// zone through applyDisplayTimeZone (TimeZoneProvider does, on every render);
// in the browser the cookie is read once and kept current by the switch.
let displayZone: string | null = null;

export function getDisplayTimeZone(): string {
  if (displayZone) return displayZone;
  if (typeof document !== "undefined") displayZone = timeZoneFromCookie(document.cookie) ?? OPERATION_TIME_ZONE;
  return displayZone ?? OPERATION_TIME_ZONE;
}

/** Makes `zone` the one formatting uses from here on, without storing it. */
export function applyDisplayTimeZone(zone: string | null | undefined): string {
  displayZone = isTimeZone(zone) ? zone : OPERATION_TIME_ZONE;
  return displayZone;
}

/** The viewer picks a zone: applied, remembered for a year, announced. Browser only. */
export function setDisplayTimeZone(zone: string): string {
  const applied = applyDisplayTimeZone(zone);
  document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(applied)}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new CustomEvent(TIME_ZONE_EVENT, { detail: applied }));
  return applied;
}
