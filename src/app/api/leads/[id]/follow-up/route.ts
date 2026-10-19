import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { FollowUpSchema, followUpDraft, sendFollowUp } from "@/lib/services/leads";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** The follow-up e-mail drafted from the meeting notes, and whether it can be sent. */
export const GET = withErrorHandling(async (_req: Request, { params }: Ctx) => json({ draft: serialize(await followUpDraft(params.id)) }));

/** Sends the follow-up as the presenter edited it, with the quotation attached. */
export const POST = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const message = FollowUpSchema.parse(await req.json().catch(() => ({})));
  return json({ lead: serialize(await sendFollowUp(params.id, message, await getOperator(req))) });
});
