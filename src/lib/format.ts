// ---------------------------------------------------------------------------
// Shared display formatting. All times render in the demo's operational
// timezone (Istanbul) so the stage, the server and the audience see the same
// clock regardless of where the app is hosted.
// ---------------------------------------------------------------------------

import { DEMO_TIME_ZONE, formatPlainDate } from "./time";

export { DEMO_TIME_ZONE };

/** "MEDICAL_REPORT" → "Medical report" */
export function formatEnum(value: string): string {
  const words = value.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatDateTime(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEMO_TIME_ZONE,
  }).format(new Date(iso));
}

export function formatDate(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: DEMO_TIME_ZONE,
  }).format(new Date(iso));
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

/** "+905321234567" → "+90 ••• ••• 4567": callers are real people, screens are public. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.length < 6) return "•••";
  return `${digits.slice(0, 3)} ••• ••• ${digits.slice(-4)}`;
}
