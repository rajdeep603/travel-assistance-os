import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { Lead, LeadSource, LeadStatus, Prisma } from "@prisma/client";
import { BRAND } from "@/lib/brand";
import { CALL_NEXT_STEP, describeCallSlot } from "@/lib/calls";
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_COST_CONTAINMENT,
  DEFAULT_INPUTS,
  DEFAULT_RUNNING_COST_PRICES,
  businessCaseReport,
  longDate,
  quoteNumber,
  type BusinessCaseInput,
} from "@/lib/business-case";
import { prisma } from "@/lib/db";
import { ApiError, badRequest, notFound, serviceUnavailable } from "@/lib/errors";
import { env } from "@/lib/env";
import { LEAD_PAINS, LEAD_SEGMENTS, painLabel, segmentLabel } from "@/lib/meeting-notes";
import { PILOT_DAYS, PILOTS, pilotPlan } from "@/lib/pilots";
import { round2 } from "@/lib/fx";
import { withRef } from "@/lib/refs";
import { utcToZoned, zonedToday } from "@/lib/time";
import { BusinessCaseInputSchema, businessCasePdf } from "./business-case-report";
import { getEmailService, isReservedAddress } from "./email";
import { upcomingCall } from "./lead-meetings";
import { sendEmail } from "./outbox";

// ---------------------------------------------------------------------------
// Leads: quotations submitted from the business case, and visitors who left
// their details on the booth's QR page. These are real prospects met at the
// booth, kept apart from the fictional demo data.
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = ["NEW", "CONTACTED", "WON", "LOST"] as const satisfies readonly LeadStatus[];
export const LEAD_SOURCES = ["QUOTATION", "VISITOR"] as const satisfies readonly LeadSource[];

/** A lead has a quotation once the presenter has submitted one; a visitor lead starts without. */
export const hasQuotation = (lead: { quoteNumber: string }): boolean => lead.quoteNumber.length > 0;

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
  source: true,
  role: true,
  message: true,
  segment: true,
  pains: true,
  pilot: true,
  notes: true,
  nextStep: true,
  nextStepOn: true,
  followUpSentAt: true,
  contactConsentAt: true,
  contactConsentBy: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Saves a quotation as a lead. Submitting the same quotation twice (a double
 * click, a retry) returns the lead already saved instead of a second one.
 * With `leadId`, the quotation goes onto that lead (a visitor from the QR
 * page being quoted after the meeting) instead of opening a second one.
 */
export async function createLead(params: { input: BusinessCaseInput; operator: string | null; leadId?: string }): Promise<{ lead: Lead; existing: boolean }> {
  const report = businessCaseReport(params.input);
  const { quote } = report;
  if (!quote.customerName || !quote.companyName) throw badRequest("Enter the customer's name and company to submit the quotation.");

  const number = quoteNumber(params.input, zonedToday());
  const same = await prisma.lead.findFirst({ where: { quoteNumber: number }, orderBy: { createdAt: "asc" } });
  // Stored JSON comes back with its keys reordered, so compare values, not text.
  if (same && isDeepStrictEqual(same.input, params.input)) return { lead: same, existing: true };

  const data = {
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
  };

  if (params.leadId) {
    const found = await prisma.lead.findUnique({ where: { id: params.leadId }, select: { id: true } });
    if (!found) throw notFound("Lead");
    const lead = await prisma.lead.update({ where: { id: params.leadId }, data });
    return { lead, existing: false };
  }

  const lead = await withRef("lead", (ref) => prisma.lead.create({ data: { ...data, ref, createdBy: params.operator } }));
  return { lead, existing: false };
}

// ---------------------------------------------------------------------------
// Visitor leads: a visitor scans the booth's QR code and leaves their own
// details on /meet. No quotation yet; the presenter adds one after the meeting.
// ---------------------------------------------------------------------------

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];

/** What the QR page asks for. `website` is a honeypot: people leave it empty, bots don't. */
export const VisitorLeadSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  company: z.string().trim().min(2, "Please enter your company.").max(120),
  email: z.string().trim().email("Please enter a valid e-mail address.").max(200).transform((v) => v.toLowerCase()),
  phone: z.string().trim().max(40).default(""),
  role: z.string().trim().max(120).default(""),
  segment: z.enum(ids(LEAD_SEGMENTS)).nullable().default(null),
  pains: z.array(z.enum(ids(LEAD_PAINS))).max(LEAD_PAINS.length).default([]),
  message: z.string().trim().max(600).default(""),
  consent: z.literal(true, { message: "Please agree to be contacted." }),
  website: z.string().max(0).default(""),
});

export type VisitorLead = z.infer<typeof VisitorLeadSchema>;

/** The business case a later quotation starts from: the standard numbers, with the visitor's details filled in. */
function visitorInput(v: VisitorLead): BusinessCaseInput {
  return {
    operation: DEFAULT_INPUTS,
    assumptions: DEFAULT_ASSUMPTIONS,
    prices: DEFAULT_RUNNING_COST_PRICES,
    costContainment: DEFAULT_COST_CONTAINMENT,
    quote: { customerName: v.name, companyName: v.company, email: v.email.trim().toLowerCase(), phone: v.phone, services: [] },
  };
}

/**
 * Saves a visitor's details from the QR page. The same e-mail address within
 * a day updates that lead (a second scan, a corrected field) rather than
 * opening another one: what they add is kept, what they leave blank isn't
 * blanked.
 */
export async function createVisitorLead(v: VisitorLead): Promise<{ lead: LeadSummary; existing: boolean }> {
  const pains = [...new Set(v.pains)];
  const email = v.email.trim().toLowerCase();
  const data = {
    customerName: v.name,
    companyName: v.company,
    email,
    phone: v.phone || null,
    role: v.role || null,
    segment: v.segment,
    pains,
    message: v.message || null,
    input: visitorInput(v) as unknown as Prisma.InputJsonObject,
  };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const same = await prisma.lead.findFirst({
    where: { source: "VISITOR", email, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { id: true, phone: true, role: true, segment: true, pains: true, message: true },
  });
  if (same) {
    const lead = await prisma.lead.update({
      where: { id: same.id },
      data: {
        ...data,
        phone: data.phone ?? same.phone,
        role: data.role ?? same.role,
        segment: data.segment ?? same.segment,
        pains: [...new Set([...same.pains, ...pains])],
        message: data.message ?? same.message,
        // They ticked consent again on this submission.
        contactConsentAt: new Date(),
        contactConsentBy: "visitor",
      },
      select: SUMMARY_SELECT,
    });
    return { lead, existing: true };
  }
  const lead = await withRef("lead", (ref) =>
    prisma.lead.create({
      data: {
        ...data,
        ref,
        source: "VISITOR",
        quoteNumber: "",
        oneTimeTotal: 0,
        monthlyCost: 0,
        firstYearCost: 0,
        netAnnualSaving: 0,
        // The QR page doesn't take the details without the consent tick.
        contactConsentAt: new Date(),
        contactConsentBy: "visitor",
        createdBy: "visitor",
      },
      select: SUMMARY_SELECT,
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
  if (!hasQuotation(lead)) throw badRequest("This lead has no quotation yet. Generate one from the business case first.");
  return businessCasePdf(lead.input, { number: lead.quoteNumber, date: lead.quoteDate });
}

export const LeadStatusSchema = z.object({ status: z.enum(LEAD_STATUSES) });
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
  const quoted = hasQuotation(lead);
  const pains = lead.pains.map(painLabel).filter((p): p is string => Boolean(p));
  const call = await upcomingCall(id);
  // A next step the booked call wrote is said once, as the call.
  const next =
    call && lead.nextStep?.startsWith(CALL_NEXT_STEP)
      ? ""
      : [lead.nextStep, lead.nextStepOn ? longDate(lead.nextStepOn.toISOString().slice(0, 10)) : null].filter(Boolean).join(", ");
  const text = [
    `Dear ${lead.customerName},`,
    "",
    quoted
      ? `Thank you for your time today. As promised, here is a short recap, with our quotation ${lead.quoteNumber} attached.`
      : `Thank you for stopping by today. As promised, here is a short recap of what ${BRAND.name} does and where it would help you.`,
    ...(pains.length ? ["", `What matters most to ${lead.companyName}:`, ...pains.map((p) => `- ${p}`)] : []),
    ...(pilot
      ? ["", `Where we would start: a ${PILOT_DAYS}-day pilot, ${pilot.label}.`, pilot.scope, "It would be judged on:", ...pilot.measures.map((m) => `- ${m}`)]
      : []),
    ...(call
      ? [
          "",
          `Our Teams call: ${describeCallSlot(call.startsAt, call.endsAt, call.timeZone)}. The invite came separately${call.joinUrl ? `, and this is the link to join: ${call.joinUrl}` : ""}.`,
        ]
      : []),
    ...(next ? ["", `Next step: ${next}.`] : []),
    "",
    "With kind regards,",
    `${BRAND.poweredBy} · ${BRAND.name}`,
  ].join("\n");
  return {
    to: lead.email,
    subject: quoted ? `${BRAND.name}: our meeting today and quotation ${lead.quoteNumber}` : `${BRAND.name}: our conversation today`,
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
  // The quotation goes with it when there is one; a visitor lead gets the recap alone.
  const attachments = hasQuotation(lead)
    ? [await businessCasePdf(lead.input, { number: lead.quoteNumber, date: lead.quoteDate })].map(({ pdf, filename }) => ({ filename, content: pdf, type: "application/pdf" }))
    : [];
  const sent = await sendEmail({
    to: lead.email!,
    subject: message.subject,
    text: message.text,
    attachments,
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

// ---------------------------------------------------------------------------
// Export: the leads as a spreadsheet for the CRM after the show.
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  "Reference",
  "Created",
  "Source",
  "Company",
  "Contact",
  "Role",
  "E-mail",
  "Phone",
  "Status",
  "Organisation",
  "Would solve first",
  "Pilot",
  "Quotation",
  "First year (EUR)",
  "Net saving a year (EUR)",
  "Next step",
  "Next step by",
  "Follow-up sent",
  "Agreed to e-mail",
  "Notes",
] as const;

/** A cell that Excel, Numbers and Sheets all read back as typed. */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Leads as CSV (UTF-8 with a byte-order mark, so Excel shows accents), one row each. */
export function leadsCsv(leads: LeadSummary[]): string {
  const rows = leads.map((l) => [
    l.ref,
    l.createdAt.toISOString(),
    l.source === "VISITOR" ? "QR page" : "Quotation",
    l.companyName,
    l.customerName,
    l.role,
    l.email,
    l.phone,
    l.status,
    segmentLabel(l.segment),
    l.pains.map(painLabel).filter(Boolean).join("; "),
    pilotPlan(l.pilot)?.label ?? null,
    l.quoteNumber || null,
    hasQuotation(l) ? Number(l.firstYearCost) : null,
    hasQuotation(l) ? Number(l.netAnnualSaving) : null,
    l.nextStep,
    l.nextStepOn ? l.nextStepOn.toISOString().slice(0, 10) : null,
    l.followUpSentAt ? l.followUpSentAt.toISOString() : null,
    l.contactConsentAt ? l.contactConsentAt.toISOString() : null,
    l.notes,
  ]);
  return "\ufeff" + [CSV_COLUMNS as readonly string[], ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
