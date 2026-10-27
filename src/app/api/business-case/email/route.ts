import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { BusinessCaseInputSchema, canEmailBusinessCase, emailBusinessCase } from "@/lib/services/business-case-report";

export const dynamic = "force-dynamic";

const address = z.string().trim().email().max(200);
const Body = z.object({
  /** The customer, and their colleagues: one e-mail each. */
  to: z.union([address, z.array(address).min(1).max(6)]),
  input: BusinessCaseInputSchema,
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().max(4000).optional(),
});

/** Whether the page can offer to e-mail the PDF. */
export const GET = withErrorHandling(async () => json({ configured: canEmailBusinessCase() }));

/** E-mails the quotation PDF, with the presenter's text and the summary in the body. */
export const POST = withErrorHandling(async (req: Request) => {
  const { to, input, subject, message } = Body.parse(await req.json().catch(() => ({})));
  const sent = await emailBusinessCase({ to, input, subject, message, operator: await getOperator(req) });
  return json({ status: sent[0].status, to: sent.map((m) => m.toAddress) });
});
