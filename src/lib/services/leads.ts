import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { Lead, LeadStatus, Prisma } from "@prisma/client";
import { businessCaseReport, quoteNumber, type BusinessCaseInput } from "@/lib/business-case";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { round2 } from "@/lib/fx";
import { withRef } from "@/lib/refs";
import { utcToZoned, zonedToday } from "@/lib/time";
import { BusinessCaseInputSchema, businessCasePdf } from "./business-case-report";

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
