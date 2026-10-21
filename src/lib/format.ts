// ---------------------------------------------------------------------------
// Shared display formatting. Times render in the display time zone (the
// operation's Istanbul clock unless the viewer switched it in the header; see
// src/lib/time-zone.ts), so the stage, the server and the audience see the
// same clock regardless of where the app is hosted.
// ---------------------------------------------------------------------------

import { DEMO_TIME_ZONE, formatPlainDate } from "./time";
import { getDisplayTimeZone } from "./time-zone";

export { DEMO_TIME_ZONE };

/** "MEDICAL_REPORT" → "Medical report" */
export function formatEnum(value: string): string {
  const words = value.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "21 Oct 2026, 22:38" in the display zone (or the one given). */
export function formatDateTime(iso: string | Date, timeZone: string = getDisplayTimeZone()): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(iso));
}

/** "21 Oct 2026" in the display zone (or the one given). */
export function formatDate(iso: string | Date, timeZone: string = getDisplayTimeZone()): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

/** "22:38" in the display zone (or the one given). */
export function formatTime(iso: string | Date, timeZone: string = getDisplayTimeZone()): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(iso));
}

/** "Mon 19 Oct, 20:00" in the display zone (or the one given). */
export function formatDayTime(iso: string | Date, timeZone: string = getDisplayTimeZone()): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone })
    .format(new Date(iso))
    .replace(/,? (\d{2}:\d{2})$/, ", $1");
}

/** "2026-10-03" (a plain slot date, no timezone) → "Fri 3 Oct" */
export function formatSlotDate(date: string): string {
  return formatPlainDate(date);
}

export function formatMoney(amount: number, currency: string | null): string {
  if (!currency) return amount.toLocaleString("en-GB");
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-GB")} ${currency}`;
  }
}

/** Money with cents, for invoices and bill review: "€4,802.50". */
export function formatMoneyExact(amount: number, currency: string | null): string {
  if (!currency) return amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

/** "+905321234567" → "+90 ••• ••• 4567": callers are real people, screens are public. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.length < 6) return "•••";
  return `${digits.slice(0, 3)} ••• ••• ${digits.slice(-4)}`;
}

/**
 * Who did something, for people: "agent:inbound-hotline" → "AI agent",
 * "operator:elif" → "Elif", "system:auto-approval" → "Auto-approval rules".
 */
export function formatActor(actor: string | null | undefined): string | undefined {
  if (!actor) return undefined;
  if (actor.startsWith("agent:")) return "AI agent";
  if (actor === "system:auto-approval") return "Auto-approval rules";
  if (actor === "system" || actor.startsWith("system:")) return "System";
  const name = actor.startsWith("operator:") ? actor.slice("operator:".length) : actor;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const END_REASONS: Record<string, string> = {
  "call ended": "Call completed",
  "caller hung up": "Caller hung up",
  "browser disconnected": "Caller closed the page",
  "browser connection error": "Caller's connection dropped",
  "media stream closed": "Phone line closed",
  "media stream error": "Phone line dropped",
  "voice model disconnected": "Voice service dropped",
  "voice model unavailable": "Voice service unavailable",
  "maximum call length reached": "Time limit reached",
  "case manager left": "Case manager left the call",
  "hospital did not answer": "Hospital didn't answer",
  "hospital hung up": "Hospital hung up",
  "interpreter disconnected": "Interpreter dropped",
};

/** Why a call ended, as a sentence ("voice model unavailable" → "Voice service unavailable"). */
export function formatEndReason(reason: string): string {
  const known = END_REASONS[reason.trim().toLowerCase()];
  if (known) return known;
  const text = reason.trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
