import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { BusinessCaseInputSchema } from "@/lib/services/business-case-report";
import { createLead, listLeads } from "@/lib/services/leads";

export const dynamic = "force-dynamic";

const Body = z.object({ input: BusinessCaseInputSchema });

/** Leads, newest first. */
export const GET = withErrorHandling(async () => json({ leads: serialize(await listLeads()) }));

/** Submits a quotation as a lead. */
export const POST = withErrorHandling(async (req: Request) => {
  const { input } = Body.parse(await req.json().catch(() => ({})));
  const { lead, existing } = await createLead({ input, operator: await getOperator(req) });
  return json({ lead: serialize({ ...lead, input: undefined }), existing }, { status: existing ? 200 : 201 });
});
