import { createHash } from "node:crypto";
import { z } from "zod";
import type { LeadMeeting } from "@prisma/client";
import { CALL_MINUTES, CALL_NEXT_STEP, MAX_CALL_ATTENDEES, callNextStep } from "@/lib/calls";
import { prisma } from "@/lib/db";
import { ApiError, badRequest, conflict, notFound, serviceUnavailable } from "@/lib/errors";
import { utcToZoned } from "@/lib/time";
import { isTimeZone, utcToWallClock, wallClockToUtc } from "@/lib/time-zone";
import { BusinessCaseInputSchema, businessCasePdf } from "./business-case-report";
import { isReservedAddress } from "./email";
import { MeetingProviderError, getMeetingService, type Availability, type MeetingAttachment } from "./meetings";

// ---------------------------------------------------------------------------
// Teams calls proposed to a lead, from the quotation or the lead's page. The
// invite goes from the organiser's Microsoft 365 calendar (meetings.ts); the
// call is kept on the lead, sets its next step, and moves a new lead to
// contacted. The lead's quotation can go with it: the PDF attached to the
// invitation and its summary below the text, so the customer gets one e-mail.
// Placeholder addresses never get an invite, as with e-mail.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

const slotFields = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a day."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a start time."),
  timeZone: z.string().refine(isTimeZone, "Pick a time zone."),
  minutes: z
    .number()
    .int()
    .refine((m) => (CALL_MINUTES as readonly number[]).includes(m), "Pick how long the call is."),
};

/** A day and time on the customer's clock, and how long. */
export const CallSlotSchema = z.object(slotFields);
export type CallSlot = z.infer<typeof CallSlotSchema>;

export const ProposeCallSchema = z.object({
  ...slotFields,
  attendees: z
    .array(z.string().trim().toLowerCase().email("Enter a valid e-mail address for everyone invited.").max(200))
    .min(1, "Enter the customer's e-mail address.")
    .max(MAX_CALL_ATTENDEES, `Invite at most ${MAX_CALL_ATTENDEES} people.`),
  subject: z.string().trim().min(1, "Enter a subject for the invite.").max(200),
  message: z.string().trim().max(4000).default(""),
  /** The lead's quotation goes in the same e-mail: its PDF attached to the invite. */
  attachQuotation: z.boolean().default(false),
});
export type ProposeCall = z.input<typeof ProposeCallSchema>;

/** What a booked call changes on its lead, for the page to show at once. */
export interface LeadAfterCall {
  status: string;
  nextStep: string | null;
  nextStepOn: Date | null;
}

/** Whether this server can send Teams invites, and from which mailbox. */
export function callsConfigured(): { configured: boolean; organizer: string | null } {
  const service = getMeetingService();
  return { configured: service.configured, organizer: service.configured ? service.organizer : null };
}

function slotInstants(slot: CallSlot, now: Date): { startsAt: Date; endsAt: Date } {
  const startsAt = wallClockToUtc(slot.date, slot.time, slot.timeZone);
  if (Number.isNaN(startsAt.getTime())) throw badRequest("Pick a valid day and start time.");
  if (startsAt.getTime() < now.getTime() + 60_000) throw badRequest("That time has already passed. Pick a later one.");
  if (startsAt.getTime() > now.getTime() + 366 * DAY_MS) throw badRequest("Pick a day within the next year.");
  return { startsAt, endsAt: new Date(startsAt.getTime() + slot.minutes * 60_000) };
}

/** Graph refused or timed out: the presenter sees a plain sentence, the log keeps Graph's. */
function providerFailure(err: unknown, what: string): ApiError {
  console.error(`[meetings] ${what}:`, err instanceof Error ? err.message : err);
  return new ApiError(`${what} Microsoft 365 didn't accept it; please try again, or use Outlook.`, 502, "MEETING_FAILED");
}

function requireService(meeting?: Pick<LeadMeeting, "provider">) {
  const service = getMeetingService();
  if (!service.configured || (meeting && meeting.provider !== service.name)) {
    throw serviceUnavailable("Teams calls aren't set up on this server, so nothing was sent. Use Outlook for this call.");
  }
  return service;
}

/**
 * The lead's next step follows its earliest upcoming call, unless the
 * presenter typed a next step of their own, which is never overwritten.
 */
async function syncNextStep(leadId: string, now: Date = new Date()): Promise<LeadAfterCall> {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { status: true, nextStep: true, nextStepOn: true } });
  if (lead.nextStep && !lead.nextStep.startsWith(CALL_NEXT_STEP)) return lead;
  const next = await prisma.leadMeeting.findFirst({
    where: { leadId, status: "SCHEDULED", startsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
  });
  const nextStep = next ? callNextStep(next.startsAt, next.timeZone) : null;
  const nextStepOn = next ? new Date(`${utcToWallClock(next.startsAt, next.timeZone).date}T00:00:00Z`) : null;
  if (lead.nextStep === nextStep && lead.nextStepOn?.getTime() === nextStepOn?.getTime()) return lead;
  return prisma.lead.update({ where: { id: leadId }, data: { nextStep, nextStepOn }, select: { status: true, nextStep: true, nextStepOn: true } });
}

/** The lead's calls, soonest first, cancelled ones included. */
export async function listCalls(leadId: string): Promise<LeadMeeting[]> {
  const found = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } });
  if (!found) throw notFound("Lead");
  return prisma.leadMeeting.findMany({ where: { leadId }, orderBy: { startsAt: "asc" } });
}

/**
 * Sends a Teams invite from the organiser's calendar and keeps the call on
 * the lead. The same time proposed twice (a double click, a retry) returns
 * the call already booked instead of a second invite.
 */
export async function proposeCall(
  leadId: string,
  input: ProposeCall,
  operator: string | null,
  now: Date = new Date()
): Promise<{ meeting: LeadMeeting; existing: boolean; lead: LeadAfterCall }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, customerName: true, email: true, status: true, quoteNumber: true, input: true, createdAt: true },
  });
  if (!lead) throw notFound("Lead");
  const service = requireService();
  const attachQuotation = input.attachQuotation ?? false;
  const message = input.message ?? "";
  if (attachQuotation && !lead.quoteNumber) throw badRequest("This lead has no quotation yet. Generate one, or send the invite alone.");

  const attendees = [...new Set(input.attendees)].filter((a) => a !== service.organizer);
  if (!attendees.length) throw badRequest("Enter the customer's e-mail address.");
  const placeholder = attendees.find((a) => isReservedAddress(a));
  if (placeholder) throw badRequest(`${placeholder} is a placeholder address, and no invite reaches it. Enter a real e-mail address.`);
  const { startsAt, endsAt } = slotInstants(input, now);

  const same = await prisma.leadMeeting.findFirst({ where: { leadId, startsAt, status: "SCHEDULED" } });
  if (same) return { meeting: same, existing: true, lead: await syncNextStep(leadId, now) };

  // A retry of this invite reuses the id; booking the time again after a cancellation doesn't.
  const cancelledBefore = await prisma.leadMeeting.count({ where: { leadId, startsAt, status: "CANCELLED" } });
  const transactionId = createHash("sha256")
    .update(`${leadId}|${startsAt.toISOString()}|${[...attendees].sort().join(",")}|${cancelledBefore}`)
    .digest("hex")
    .slice(0, 40);
  // The quotation exactly as filed on the lead: its own number and date.
  let text = message;
  let attachments: MeetingAttachment[] | undefined;
  if (attachQuotation) {
    const { pdf, filename, report } = await businessCasePdf(BusinessCaseInputSchema.parse(lead.input), {
      number: lead.quoteNumber,
      date: utcToZoned(lead.createdAt).date,
    });
    text = [message, report.summary].filter(Boolean).join("\n\n");
    attachments = [{ filename, content: pdf, type: "application/pdf" }];
  }
  const scheduled = await service
    .create({
      subject: input.subject,
      text,
      startsAt,
      endsAt,
      attendees: attendees.map((email) => ({ email, ...(email === lead.email?.toLowerCase() ? { name: lead.customerName } : {}) })),
      attachments,
      transactionId,
    })
    .catch((err: unknown) => {
      throw providerFailure(err, "The invite couldn't be sent.");
    });

  const meeting = await prisma.leadMeeting.create({
    data: {
      leadId,
      subject: input.subject,
      message,
      startsAt,
      endsAt,
      timeZone: input.timeZone,
      attendees,
      organizer: service.organizer ?? "",
      provider: service.name,
      providerEventId: scheduled.id,
      joinUrl: scheduled.joinUrl,
      webLink: scheduled.webLink,
      withQuotation: attachQuotation,
      createdBy: operator,
    },
  });
  if (lead.status === "NEW") await prisma.lead.update({ where: { id: leadId }, data: { status: "CONTACTED" } });
  return { meeting, existing: false, lead: await syncNextStep(leadId, now) };
}

async function bookedCall(id: string): Promise<LeadMeeting> {
  const meeting = await prisma.leadMeeting.findUnique({ where: { id } });
  if (!meeting) throw notFound("Call");
  if (meeting.status === "CANCELLED") throw conflict("This call was cancelled. Propose a new one instead.");
  return meeting;
}

/** Moves the call; everyone invited gets the update from Outlook. */
export async function rescheduleCall(id: string, slot: CallSlot, now: Date = new Date()): Promise<{ meeting: LeadMeeting; lead: LeadAfterCall }> {
  const meeting = await bookedCall(id);
  const service = requireService(meeting);
  const { startsAt, endsAt } = slotInstants(slot, now);
  let moved;
  try {
    moved = await service.reschedule(meeting.providerEventId, { startsAt, endsAt });
  } catch (err) {
    if (err instanceof MeetingProviderError && err.status === 404) {
      await prisma.leadMeeting.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: now } });
      await syncNextStep(meeting.leadId, now);
      throw conflict("This call is no longer in the Outlook calendar. Propose a new one instead.");
    }
    throw providerFailure(err, "The call couldn't be moved.");
  }
  const updated = await prisma.leadMeeting.update({
    where: { id },
    data: { startsAt, endsAt, timeZone: slot.timeZone, joinUrl: moved.joinUrl ?? meeting.joinUrl, webLink: moved.webLink ?? meeting.webLink },
  });
  return { meeting: updated, lead: await syncNextStep(meeting.leadId, now) };
}

/** Cancels the call for everyone invited. Cancelling twice is harmless. */
export async function cancelCall(id: string, now: Date = new Date()): Promise<{ meeting: LeadMeeting; lead: LeadAfterCall }> {
  const found = await prisma.leadMeeting.findUnique({ where: { id } });
  if (!found) throw notFound("Call");
  if (found.status === "CANCELLED") return { meeting: found, lead: await syncNextStep(found.leadId, now) };
  if (found.endsAt.getTime() <= now.getTime()) throw badRequest("That call has already taken place.");
  const service = requireService(found);
  await service.cancel(found.providerEventId, "This call has been cancelled. We will be in touch to find another time.").catch((err: unknown) => {
    throw providerFailure(err, "The call couldn't be cancelled.");
  });
  const meeting = await prisma.leadMeeting.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: now } });
  return { meeting, lead: await syncNextStep(found.leadId, now) };
}

/** The organiser's calendar at that time; "unknown" rather than an error, since it only warns. */
export async function callAvailability(slot: CallSlot, now: Date = new Date()): Promise<Availability> {
  const service = getMeetingService();
  if (!service.configured) return "unknown";
  const startsAt = wallClockToUtc(slot.date, slot.time, slot.timeZone);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < now.getTime()) return "unknown";
  try {
    return await service.availability({ startsAt, endsAt: new Date(startsAt.getTime() + slot.minutes * 60_000) });
  } catch (err) {
    console.warn("[meetings] availability:", err instanceof Error ? err.message : err);
    return "unknown";
  }
}

/** The lead's next call still to come, for the follow-up e-mail. */
export function upcomingCall(leadId: string, now: Date = new Date()): Promise<LeadMeeting | null> {
  return prisma.leadMeeting.findFirst({ where: { leadId, status: "SCHEDULED", startsAt: { gt: now } }, orderBy: { startsAt: "asc" } });
}
