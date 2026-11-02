import { DEMO_TIME_ZONE, utcToZoned, weekdayKey } from "@/lib/time";

// ---------------------------------------------------------------------------
// Is the practice open now? From the opening hours it stated on the call or
// its link ("Mon–Fri 8:00–18:00, Sat 9:00–13:00", "24/7"), in its own local
// time; when it never stated any, from the weekly slot template the demo
// books against. Pure functions, unit-tested in tests/unit/provider-hours.
// ---------------------------------------------------------------------------

export interface OpenState {
  /** null when the hours are unknown. */
  open: boolean | null;
  /** "18:00" when open: when it closes today. */
  until?: string;
  /** "Mon 8:00" or "8:00" when closed: when it next opens. */
  opensAt?: string;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type Interval = { start: number; end: number };
export type WeeklyHours = Interval[][]; // 7 days, minutes since midnight

const minutes = (t: string): number | null => {
  const m = t.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  return h <= 24 && min < 60 ? h * 60 + min : null;
};
const hhmm = (m: number) => `${Math.floor((m % 1440) / 60)}:${String(m % 60).padStart(2, "0")}`;

const dayIndex = (word: string): number | null => {
  const w = word.trim().toLowerCase().slice(0, 3);
  const i = DAYS.indexOf(w);
  return i >= 0 ? i : null;
};

/** Parses "Mon–Fri 8:00–18:00, Sat 9:00–13:00" (also "daily", "24/7", "Mon-Sat 8-20") into weekly intervals; null when it can't. */
export function parseHours(text: string | null | undefined): WeeklyHours | null {
  if (!text) return null;
  const t = text.trim();
  if (/^24\s*\/\s*7$|^24 hours$|^open 24 hours$/i.test(t)) return DAYS.map(() => [{ start: 0, end: 1440 }]);
  const week: WeeklyHours = DAYS.map(() => []);
  let any = false;
  for (const part of t.split(/\s*[,;]\s*/)) {
    const m = part.match(/^(?:(daily|every day|mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:\s*[–-]\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*)?\s+)?(\d{1,2}(?:[:.]\d{2})?)\s*[–-]\s*(\d{1,2}(?:[:.]\d{2})?)(?:\s+(daily|every day))?$/i);
    if (!m) continue;
    const start = minutes(m[3]);
    const end = minutes(m[4]);
    if (start == null || end == null) continue;
    let from = 0;
    let to = 6;
    const dayWord = m[1]?.toLowerCase();
    if (dayWord && !/^(daily|every day)$/.test(dayWord)) {
      const a = dayIndex(dayWord);
      if (a == null) continue;
      from = a;
      to = m[2] ? (dayIndex(m[2]) ?? a) : a;
    }
    for (let d = from; ; d = (d + 1) % 7) {
      week[d].push(end > start ? { start, end } : { start, end: 1440 });
      if (end <= start) week[(d + 1) % 7].push({ start: 0, end });
      any = true;
      if (d === to) break;
    }
  }
  return any ? week : null;
}

function localNow(timeZone: string, now: Date): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = dayIndex(get("weekday")) ?? 0;
  return { day, minute: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

/** Open now, from stated hours in the practice's own zone. */
export function openStateFromHours(hours: string | null | undefined, timeZone: string, now = new Date()): OpenState {
  const week = parseHours(hours);
  if (!week) return { open: null };
  const { day, minute } = localNow(timeZone, now);
  const today = week[day].find((i) => minute >= i.start && minute < i.end);
  if (today) return { open: true, until: today.end >= 1440 && week[(day + 1) % 7].some((i) => i.start === 0) ? "00:00" : hhmm(today.end) };
  const later = week[day].filter((i) => i.start > minute).sort((a, b) => a.start - b.start)[0];
  if (later) return { open: false, opensAt: hhmm(later.start) };
  for (let k = 1; k <= 7; k++) {
    const d = (day + k) % 7;
    const first = [...week[d]].sort((a, b) => a.start - b.start)[0];
    if (first) return { open: false, opensAt: `${DAY_LABEL[d]} ${hhmm(first.start)}` };
  }
  return { open: false };
}

/** Open now, from the weekly slot template ({ mon: ["09:00", …] }) on the demo's own clock: open from the first slot to half an hour after the last. */
export function openStateFromSlots(availability: unknown, now = new Date()): OpenState {
  const template = availability as Record<string, string[]> | null | undefined;
  if (!template || typeof template !== "object") return { open: null };
  const { date, time } = utcToZoned(now);
  const key = weekdayKey(date);
  const slots = (template[key] ?? []).map(minutes).filter((m): m is number => m != null).sort((a, b) => a - b);
  const minute = minutes(time) ?? 0;
  if (slots.length) {
    const start = slots[0];
    const end = slots[slots.length - 1] + 30;
    if (minute >= start && minute < end) return { open: true, until: hhmm(end) };
    if (minute < start) return { open: false, opensAt: hhmm(start) };
  }
  const order = DAYS;
  const todayIdx = order.indexOf(key);
  for (let k = 1; k <= 7; k++) {
    const d = order[(todayIdx + k) % 7];
    const next = (template[d] ?? []).map(minutes).filter((m): m is number => m != null).sort((a, b) => a - b)[0];
    if (next != null) return { open: false, opensAt: `${DAY_LABEL[(todayIdx + k) % 7]} ${hhmm(next)}` };
  }
  return { open: null };
}

/** The practice's zone from where it is; the demo's clock (Istanbul) when the city isn't known. */
export function timeZoneForCity(city: string | null | undefined): string {
  const c = (city ?? "").toLowerCase();
  const zones: [RegExp, string][] = [
    [/singapore/, "Asia/Singapore"],
    [/kuala lumpur/, "Asia/Kuala_Lumpur"],
    [/bangkok/, "Asia/Bangkok"],
    [/shanghai|beijing/, "Asia/Shanghai"],
    [/dubai|abu dhabi/, "Asia/Dubai"],
    [/hurghada|cairo/, "Africa/Cairo"],
    [/sousse|tunis/, "Africa/Tunis"],
    [/punta cana|santo domingo/, "America/Santo_Domingo"],
    [/cancun/, "America/Cancun"],
    [/rio/, "America/Sao_Paulo"],
    [/fort lauderdale|miami|orlando|new york/, "America/New_York"],
    [/saranda|tirana/, "Europe/Tirane"],
    [/geneva|zurich/, "Europe/Zurich"],
  ];
  return zones.find(([re]) => re.test(c))?.[1] ?? DEMO_TIME_ZONE;
}

/** Open now: stated hours first, the slot template otherwise. */
export function openState(p: { hours: string | null; availability: unknown; city: string; kind: string }, now = new Date()): OpenState {
  if (p.kind === "TELEMEDICINE") return { open: true, until: "00:00" };
  const fromHours = openStateFromHours(p.hours, timeZoneForCity(p.city), now);
  if (fromHours.open != null) return fromHours;
  return openStateFromSlots(p.availability, now);
}
