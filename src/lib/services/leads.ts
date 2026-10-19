import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { Lead, LeadStatus, Prisma } from "@prisma/client";
import { BRAND } from "@/lib/brand";
import { businessCaseReport, longDate, quoteNumber, type BusinessCaseInput } from "@/lib/business-case";
import { prisma } from "@/lib/db";
import { ApiError, badRequest, notFound, serviceUnavailable } from "@/lib/errors";
import { env } from "@/lib/env";
import { LEAD_PAINS, LEAD_SEGMENTS, painLabel } from "@/lib/meeting-notes";
import { PILOT_DAYS, PILOTS, pilotPlan } from "@/lib/pilots";
import { round2 } from "@/lib/fx";
import { withRef } from "@/lib/refs";
import { utcToZoned, zonedToday } from "@/lib/time";
import { BusinessCaseInputSchema, businessCasePdf } from "./business-case-report";
import { getEmailService, isReservedAddress } from "./email";
import { sendEmail } from "./outbox";

// ---------------------------------------------------------------------------
// Leads: quotations submitted from the business case. These are real
// prospects met at the booth, kept apart from the fictional demo data.
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = ["NEW", "CONTACTED", "WON", "LOST"] as const satisfies readonly LeadStatus[];

/** A lead in a list: everything but the quotation's inputs. */
export type LeadSummary = Omit<Lead, "input">;

const SUMMARY_SELECT = {
  id: true,
  ref: true,
  quoteNumber: true,
  customerName: true,
  companyName: true,
  email: true,
  phone: true,
  oneTimeTotal: true,
  monthlyCost: true,
  firstYearCost: true,
  netAnnualSaving: true,
  status: true,
  segment: true,
  pains: true,
  pilot: true,
  notes: true,
  nextStep: true,
  nextStepOn: true,
  followUpSentAt: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Saves a quotation as a lead. Submitting the same quotation twice (a double
 * click, a retry) returns the lead already saved instead of a second one.
 */
export async function createLead(params: { input: BusinessCaseInput; operator: string | null }): Promise<{ lead: Lead; existing: boolean }> {
  const report = businessCaseReport(params.input);
  const { quote } = report;
  if (!quote.customerName || !quote.companyName) throw badRequest("Enter the customer's name and company to submit the quotation.");

  const number = quoteNumber(params.input, zonedToday());
  const same = await prisma.lead.findFirst({ where: { quoteNumber: number }, orderBy: { createdAt: "asc" } });
  // Stored JSON comes back with its keys reordered, so compare values, not text.
  if (same && isDeepStrictEqual(same.input, params.input)) return { lead: same, existing: true };

  const lead = await withRef("lead", (ref) =>
    prisma.lead.create({
      data: {
        ref,
        quoteNumber: number,
        customerName: quote.customerName,
        companyName: quote.companyName,
        email: quote.email || null,
        phone: quote.phone || null,
        input: params.input as unknown as Prisma.InputJsonObject,
        oneTimeTotal: round2(quote.oneTimeTotal),
        monthlyCost: round2(quote.monthlyRunningCost),
        firstYearCost: round2(quote.firstYearCost),
        netAnnualSaving: round2(report.running.netAnnualSaving),
        pilot: pilotPlan(params.input.quote.pilot)?.id ?? null,
        createdBy: params.operator,
      },
    })
  );
  return { lead, existing: false };
}

export function listLeads(): Promise<LeadSummary[]> {
  return prisma.lead.findMany({ orderBy: { createdAt: "desc" }, select: SUMMARY_SELECT });
}

/** A lead with its quotation inputs, re-read through the schema so older shapes still render. */
export async function getLead(id: string): Promise<LeadSummary & { input: BusinessCaseInput; quoteDate: string }> {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) throw notFound("Lead");
  return { ...lead, input: BusinessCaseInputSchema.parse(lead.input), quoteDate: utcToZoned(lead.createdAt).date };
}

export async function setLeadStatus(id: string, status: LeadStatus): Promise<LeadSummary> {
  const found = await prisma.lead.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw notFound("Lead");
  return prisma.lead.update({ where: { id }, data: { status }, select: SUMMARY_SELECT });
}

/** Removes a lead and the personal details on it, for good. */
export async function deleteLead(id: string): Promise<void> {
  const { count } = await prisma.lead.deleteMany({ where: { id } });
  if (!count) throw notFound("Lead");
}

/** The lead's quotation as first given: its own number and date. */
export async function leadPdf(id: string) {
  const lead = await getLead(id);
  return businessCasePdf(lead.input, { number: lead.quoteNumber, date: lead.quoteDate });
}

export const LeadStatusSchema = z.object({ status: z.enum(LEAD_STATUSES) });

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);

/** What a presenter can change on a lead after the meeting; every field optional. */
export const LeadUpdateSchema = z
  .object({
    status: z.enum(LEAD_STATUSES),
    email: z
      .union([z.literal(""), z.string().trim().email().max(200)])
      .nullable()
      .transform((v) => v || null),
    phone: text(40),
    segment: z.enum(ids(LEAD_SEGMENTS)).nullable(),
    pains: z.array(z.enum(ids(LEAD_PAINS))).max(LEAD_PAINS.length),
    pilot: z.enum(ids(PILOTS)).nullable(),
    notes: text(4000),
    nextStep: text(300),
    nextStepOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null)),
  })
  .partial();

export async function updateLead(id: string, changes: z.infer<typeof LeadUpdateSchema>): Promise<LeadSummary> {
  const found = await prisma.lead.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw notFound("Lead");
  const data = { ...changes, ...(changes.pains ? { pains: [...new Set(changes.pains)] } : {}) };
  return prisma.lead.update({ where: { id }, data, select: SUMMARY_SELECT });
}

// ---------------------------------------------------------------------------
// The follow-up: a recap of the meeting in the presenter's words, with the
// quotation attached, sent the same evening while the meeting is fresh.
// ---------------------------------------------------------------------------

export interface FollowUpDraft {
  to: string | null;
  subject: string;
  text: string;
  /** Why it can't be sent yet, if it can't. */
  blocked: string | null;
  sentAt: Date | null;
}

export async function followUpDraft(id: string): Promise<FollowUpDraft> {
  const lead = await getLead(id);
  const pilot = pilotPlan(lead.pilot);
  const pains = lead.pains.map(painLabel).filter((p): p is string => Boolean(p));
  const next = [lead.nextStep, lead.nextStepOn ? longDate(lead.nextStepOn.toISOString().slice(0, 10)) : null].filter(Boolean).join(", ");
  const text = [
    `Dear ${lead.customerName},`,
    "",
    `Thank you for your time today. As promised, here is a short recap, with our quotation ${lead.quoteNumber} attached.`,
    ...(pains.length ? ["", `What matters most to ${lead.companyName}:`, ...pains.map((p) => `- ${p}`)] : []),
    ...(pilot
      ? ["", `Where we would start: a ${PILOT_DAYS}-day pilot, ${pilot.label}.`, pilot.scope, "It would be judged on:", ...pilot.measures.map((m) => `- ${m}`)]
      : []),
    ...(next ? ["", `Next step: ${next}.`] : []),
    "",
    "With kind regards,",
    `${BRAND.poweredBy} · ${BRAND.name}`,
  ].join("\n");
  return {
    to: lead.email,
    subject: `${BRAND.name}: our meeting today and quotation ${lead.quoteNumber}`,
    text,
    blocked: followUpBlocked(lead.email),
    sentAt: lead.followUpSentAt,
  };
}

function followUpBlocked(to: string | null): string | null {
  if (!getEmailService().configured) return "E-mail isn't set up on this server. Download the PDF and send it from your own mailbox.";
  if (!to) return "Add the visitor's e-mail address to the lead first.";
  if (isReservedAddress(to)) return "That's a placeholder address, and no mail reaches it.";
  return null;
}

export const FollowUpSchema = z.object({ subject: z.string().trim().min(1).max(200), text: z.string().trim().min(1).max(8000) });

/** Sends the follow-up as written, with the quotation PDF, and marks the lead contacted. */
export async function sendFollowUp(id: string, message: z.infer<typeof FollowUpSchema>, operator: string | null): Promise<LeadSummary> {
  const lead = await getLead(id);
  const blocked = followUpBlocked(lead.email);
  if (blocked) throw getEmailService().configured ? badRequest(blocked) : serviceUnavailable(blocked);
  const { pdf, filename } = await businessCasePdf(lead.input, { number: lead.quoteNumber, date: lead.quoteDate });
  const sent = await sendEmail({
    to: lead.email!,
    subject: message.subject,
    text: message.text,
    attachments: [{ filename, content: pdf, type: "application/pdf" }],
    automatic: false,
    approvedBy: operator,
    replyTo: env.followUpReplyTo || undefined,
  });
  if (sent.status === "FAILED") throw new ApiError("The e-mail couldn't be sent. Check the address, or download the PDF instead.", 502, "SEND_FAILED");
  return prisma.lead.update({
    where: { id },
    data: { followUpSentAt: new Date(), ...(lead.status === "NEW" ? { status: "CONTACTED" } : {}) },
    select: SUMMARY_SELECT,
  });
}
