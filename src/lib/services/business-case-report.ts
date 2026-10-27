import { z } from "zod";
import type { OutboundMessage } from "@prisma/client";
import { BRAND } from "@/lib/brand";
import {
  COST_ITEMS,
  EMPTY_QUOTE,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_COST_CONTAINMENT,
  DEFAULT_INPUTS,
  DEFAULT_RUNNING_COST_PRICES,
  businessCaseReport,
  quoteMeta,
  quoteNumber,
  type BusinessCaseInput,
  type BusinessCaseReport,
} from "@/lib/business-case";
import { ApiError, badRequest, serviceUnavailable } from "@/lib/errors";
import { zonedToday } from "@/lib/time";
import { quotationPdfName, renderQuotationPdf } from "./business-case-pdf";
import { getEmailService, isReservedAddress } from "./email";
import { sendEmail } from "./outbox";

// ---------------------------------------------------------------------------
// The business case leaves the booth as a quotation from Sthiram: a PDF to
// download, or e-mailed to the visitor with the PDF attached and the summary
// in the body. The server recomputes every figure from the presenter's numbers.
// ---------------------------------------------------------------------------

// A blank field reaches the server as null and counts as zero, as on the page;
// so does a field a saved lead predates (the busiest month, added later).
const num = z.number().finite().nullable().optional().transform((v) => v ?? 0);

function numbers<T extends object>(defaults: T) {
  return z.object(Object.fromEntries(Object.keys(defaults).map((k) => [k, num])) as { [K in keyof T]: typeof num });
}

export const BusinessCaseInputSchema = z.object({
  operation: numbers(DEFAULT_INPUTS),
  assumptions: numbers(DEFAULT_ASSUMPTIONS),
  prices: numbers(DEFAULT_RUNNING_COST_PRICES),
  costContainment: numbers(DEFAULT_COST_CONTAINMENT),
  quote: z
    .object({
      customerName: z.string().trim().max(120).default(""),
      companyName: z.string().trim().max(120).default(""),
      email: z.union([z.literal(""), z.string().trim().email().max(200)]).default(""),
      phone: z.string().trim().max(40).default(""),
      services: z.array(z.object({ description: z.string().trim().max(160), amount: num })).max(20).default([]),
      pilot: z.string().trim().max(40).optional(),
      excluded: z.array(z.enum(COST_ITEMS)).max(COST_ITEMS.length).optional(),
      gainsharePct: z.number().finite().min(0).max(100).optional(),
    })
    .default(EMPTY_QUOTE),
});

/**
 * The quotation PDF. A saved lead passes its own number and date, so the PDF
 * downloaded later matches the one first given to the customer.
 */
export async function businessCasePdf(
  input: BusinessCaseInput,
  fixed?: { number: string; date: string }
): Promise<{ pdf: Buffer; filename: string; number: string; report: BusinessCaseReport }> {
  const date = fixed?.date ?? zonedToday();
  const number = fixed?.number ?? quoteNumber(input, date);
  const report = businessCaseReport(input);
  const pdf = await renderQuotationPdf(report, quoteMeta(input, date, number));
  return { pdf, filename: quotationPdfName(number), number, report };
}

/** Whether this server can send e-mail at all (otherwise the page offers the download only). */
export function canEmailBusinessCase(): boolean {
  return getEmailService().configured;
}

/** The quotation e-mail's text as first drafted: the presenter can write their own; the summary always follows. */
export const quotationEmailText = (number: string) =>
  `Hello,\n\nPlease find attached our quotation ${number}: the one-time services, the monthly running cost, and what ${BRAND.name} would return with your numbers. The summary is below.`;

/**
 * E-mails the quotation PDF, the summary below the text, one message per
 * recipient (the customer, their colleagues). Every address is checked before
 * any is sent.
 */
export async function emailBusinessCase(params: {
  to: string | string[];
  input: BusinessCaseInput;
  operator: string | null;
  subject?: string;
  message?: string;
}): Promise<OutboundMessage[]> {
  if (!canEmailBusinessCase()) {
    throw serviceUnavailable("E-mail isn't set up on this server, so nothing was sent. Download the PDF and attach it to your own e-mail.");
  }
  const recipients = [...new Set((Array.isArray(params.to) ? params.to : [params.to]).map((a) => a.trim().toLowerCase()))].filter(Boolean);
  if (!recipients.length) throw badRequest("Enter the customer's e-mail address to send the quotation.");
  // A placeholder would be "sent" to nobody: the demo's example domains never leave the server.
  const placeholder = recipients.find((a) => isReservedAddress(a));
  if (placeholder) throw badRequest(`${placeholder} is a placeholder address, and no mail reaches it. Enter the visitor's real e-mail address.`);
  const { pdf, filename, number, report } = await businessCasePdf(params.input);
  const sent: OutboundMessage[] = [];
  for (const to of recipients) {
    const message = await sendEmail({
      to,
      subject: params.subject?.trim() || `${BRAND.name} quotation ${number}`,
      text: [params.message?.trim() || quotationEmailText(number), "", report.summary].join("\n"),
      attachments: [{ filename, content: pdf, type: "application/pdf" }],
      automatic: false,
      approvedBy: params.operator,
    });
    if (message.status === "FAILED") {
      throw new ApiError(
        sent.length
          ? `The quotation reached ${sent.map((m) => m.toAddress).join(", ")}, but not ${to}. Check that address.`
          : "The e-mail couldn't be sent. Check the address, or download the PDF instead.",
        502,
        "SEND_FAILED"
      );
    }
    sent.push(message);
  }
  return sent;
}
