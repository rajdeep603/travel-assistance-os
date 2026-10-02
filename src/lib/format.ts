// ---------------------------------------------------------------------------
// Shared display formatting. All times render in the demo's operational
// timezone (Istanbul) so the stage, the server and the audience see the same
// clock regardless of where the app is hosted.
// ---------------------------------------------------------------------------

export const DEMO_TIME_ZONE = "Europe/Istanbul";

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
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
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
