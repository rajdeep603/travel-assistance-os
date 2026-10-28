import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { CardLeadSchema, saveCardLead } from "@/lib/services/business-cards";

export const dynamic = "force-dynamic";

/** Saves a checked business card as a lead, or onto the lead with the same e-mail address. */
export const POST = withErrorHandling(async (req: Request) => {
  const card = CardLeadSchema.parse(await req.json().catch(() => ({})));
  const { lead, existing } = await saveCardLead(card, await getOperator(req));
  return json({ lead: serialize(lead), existing }, { status: existing ? 200 : 201 });
});
