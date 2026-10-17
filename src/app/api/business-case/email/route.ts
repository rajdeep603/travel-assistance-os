import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { BusinessCaseInputSchema, canEmailBusinessCase, emailBusinessCase } from "@/lib/services/business-case-report";

export const dynamic = "force-dynamic";

const Body = z.object({ to: z.string().trim().email().max(200), input: BusinessCaseInputSchema });

/** Whether the page can offer to e-mail the PDF. */
export const GET = withErrorHandling(async () => json({ configured: canEmailBusinessCase() }));

/** E-mails the business case PDF, with the summary in the body. */
export const POST = withErrorHandling(async (req: Request) => {
  const { to, input } = Body.parse(await req.json().catch(() => ({})));
  const sent = await emailBusinessCase({ to, input, operator: await getOperator(req) });
  return json({ status: sent.status, to: sent.toAddress });
});
