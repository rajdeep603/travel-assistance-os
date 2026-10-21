import { DEMO_TIME_ZONE } from "./time";

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
