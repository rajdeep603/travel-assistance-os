import { z } from "zod";
import type { OutboundMessage } from "@prisma/client";
import { BRAND } from "@/lib/brand";
import {
  QUOTE_VALID_DAYS,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_COST_CONTAINMENT,
  DEFAULT_INPUTS,
  DEFAULT_RUNNING_COST_PRICES,
  businessCaseReport,
  quoteNumber,
  type BusinessCaseInput,
  type BusinessCaseReport,
} from "@/lib/business-case";
import { ApiError, badRequest, serviceUnavailable } from "@/lib/errors";
import { addDays, zonedToday } from "@/lib/time";
import { quotationPdfName, renderQuotationPdf } from "./business-case-pdf";
import { getEmailService, isReservedAddress } from "./email";
import { sendEmail } from "./outbox";

// ---------------------------------------------------------------------------
// The business case leaves the booth as a quotation from Sthiram: a PDF to
// download, or e-mailed to the visitor with the PDF attached and the summary
// in the body. The server recomputes every figure from the presenter's numbers.
// ---------------------------------------------------------------------------

// A blank field reaches the server as null and counts as zero, as on the page.
const num = z.number().finite().nullable().transform((v) => v ?? 0);

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
      preparedFor: z.string().trim().max(120).default(""),
      services: z.array(z.object({ description: z.string().trim().max(160), amount: num })).max(20).default([]),
    })
    .default({ preparedFor: "", services: [] }),
});

export async function businessCasePdf(
  input: BusinessCaseInput
): Promise<{ pdf: Buffer; filename: string; number: string; report: BusinessCaseReport }> {
  const date = zonedToday();
  const number = quoteNumber(input, date);
  const report = businessCaseReport(input);
  const pdf = await renderQuotationPdf(report, { number, date, validUntil: addDays(date, QUOTE_VALID_DAYS) });
  return { pdf, filename: quotationPdfName(number), number, report };
}

/** Whether this server can send e-mail at all (otherwise the page offers the download only). */
export function canEmailBusinessCase(): boolean {
  return getEmailService().configured;
}

export async function emailBusinessCase(params: { to: string; input: BusinessCaseInput; operator: string | null }): Promise<OutboundMessage> {
  if (!canEmailBusinessCase()) {
    throw serviceUnavailable("E-mail isn't set up on this server, so nothing was sent. Download the PDF and attach it to your own e-mail.");
  }
  // A placeholder would be "sent" to nobody: the demo's example domains never leave the server.
  if (isReservedAddress(params.to)) throw badRequest("That's a placeholder address, and no mail reaches it. Enter the visitor's real e-mail address.");
  const { pdf, filename, number, report } = await businessCasePdf(params.input);
  const sent = await sendEmail({
    to: params.to,
    subject: `${BRAND.name} quotation ${number}`,
    text: [
      "Hello,",
      "",
      `Please find attached our quotation ${number}: the one-time services, the monthly running cost, and what ${BRAND.name} would return with your numbers. The summary is below.`,
      "",
      report.summary,
    ].join("\n"),
    attachments: [{ filename, content: pdf, type: "application/pdf" }],
    automatic: false,
    approvedBy: params.operator,
  });
  if (sent.status === "FAILED") throw new ApiError("The e-mail couldn't be sent. Check the address, or download the PDF instead.", 502, "SEND_FAILED");
  return sent;
}
