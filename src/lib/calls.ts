import { BRAND } from "./brand";
import { addDays, weekdayIndex } from "./time";
import { timeZoneLabel, utcToWallClock } from "./time-zone";

// ---------------------------------------------------------------------------
// Teams calls proposed to a lead: the wording and the arithmetic the
// quotation, the lead page and the server share (no database here). The
// booking itself is src/lib/services/lead-meetings.ts.
// ---------------------------------------------------------------------------

export const CALL_MINUTES = [15, 30, 45, 60] as const;
export type CallMinutes = (typeof CALL_MINUTES)[number];
export const DEFAULT_CALL_MINUTES: CallMinutes = 30;
/** Invitees besides the customer: their colleagues, ours. */
export const MAX_CALL_ATTENDEES = 6;

/** How a booked call starts the lead's next step; a next step typed by hand never does. */
export const CALL_NEXT_STEP = "Teams call";

/** "Teams call at 11:00 London time": with the lead's next-step date, the follow-up reads it as written. */
export function callNextStep(startsAt: Date, timeZone: string): string {
  return `${CALL_NEXT_STEP} at ${utcToWallClock(startsAt, timeZone).time} ${zoneWords(timeZone)}`;
}

/** "London time", "India time", "UTC". */
export function zoneWords(timeZone: string): string {
  const label = timeZoneLabel(timeZone);
  return label === "UTC" ? "UTC" : `${label} time`;
}

/** "Tue 3 Nov 2026, 11:00–11:30 London time" */
export function describeCallSlot(startsAt: Date | string, endsAt: Date | string, timeZone: string): string {
  const start = new Date(startsAt);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone })
    .format(start)
    .replace(",", "");
  return `${day}, ${utcToWallClock(start, timeZone).time}–${utcToWallClock(new Date(endsAt), timeZone).time} ${zoneWords(timeZone)}`;
}

/** Where the time picker starts: the next working day at 10:00 on the chosen clock. */
export function defaultCallSlot(timeZone: string, now: Date = new Date()): { date: string; time: string } {
  let date = addDays(utcToWallClock(now, timeZone).date, 1);
  while (weekdayIndex(date) === 0 || weekdayIndex(date) === 6) date = addDays(date, 1);
  return { date, time: "10:00" };
}

/** What goes to the customer in one e-mail: the quotation, the Teams invite, or both. */
export interface SendParts {
  quotation: boolean;
  invite: boolean;
}

/** What they told us: their own words from the QR page, or the problems picked in the meeting notes. */
export interface Mentioned {
  words?: string | null;
  pains?: string[];
}

/** Their own words, when short enough to quote; otherwise what they picked. */
function mentionedLines(m: Mentioned | undefined, company: string): string[] {
  const words = m?.words?.trim().replace(/\s+/g, " ");
  if (words && words.length <= 240) return ["", `You mentioned: “${words}”`];
  if (m?.pains?.length) return ["", `What matters most to ${company || "you"}:`, ...m.pains.map((p) => `- ${p}`)];
  return [];
}

/**
 * The e-mail as first drafted for what is ticked; the presenter edits it
 * before it goes. Personal on purpose: their name, what they told us, the
 * agreed next step. An invite alone never mentions a quotation they haven't
 * had. With the quotation, its summary follows the text (added on the server).
 */
export function sendDraft(
  p: { customerName: string; companyName?: string; quoteNumber?: string | null; mentioned?: Mentioned } & SendParts
): { subject: string; message: string } {
  const q = p.quoteNumber ?? "";
  const company = p.companyName?.trim() ?? "";
  const quotation = p.quotation && Boolean(q);
  const greeting = `Dear ${p.customerName.trim() || "all"},`;
  const mentioned = mentionedLines(p.mentioned, company);
  const attached = `Please find attached our quotation ${q}: the one-time services, the monthly running cost, and what ${BRAND.name} would return with your numbers. The summary is below.`;
  const signature = ["With kind regards,", `${BRAND.poweredBy} · ${BRAND.name}`];
  if (quotation && !p.invite) {
    return { subject: `${BRAND.name} quotation ${q}`, message: [greeting, "", attached, ...mentioned, "", ...signature].join("\n") };
  }
  if (quotation) {
    return {
      subject: `${BRAND.name} quotation ${q} and a call to go through it`,
      message: [
        greeting,
        "",
        attached,
        ...mentioned,
        "",
        "We would like to go through it with your team on a Teams call, at the time in this invitation. If it doesn't suit you, propose a new one and we will move it.",
        "",
        ...signature,
      ].join("\n"),
    };
  }
  return {
    subject: company ? `${company} and ${BRAND.name}: follow-up call` : `${BRAND.name}: follow-up call`,
    message: [
      greeting,
      "",
      "Thank you for the conversation. As agreed, here is our follow-up call.",
      ...mentioned,
      "",
      "On the call we would like to understand your workflow, volumes and systems, so that what we propose fits.",
      "",
      "If the time doesn't suit you, propose a new one from the invite and we will move it.",
      "",
      ...signature,
    ].join("\n"),
  };
}
