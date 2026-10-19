import { json, serialize, withErrorHandling } from "@/lib/api";
import { LeadUpdateSchema, deleteLead, getLead, updateLead } from "@/lib/services/leads";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** A lead with the inputs its quotation was built from. */
export const GET = withErrorHandling(async (_req: Request, { params }: Ctx) => json({ lead: serialize(await getLead(params.id)) }));

/** Moves a lead along (new, contacted, won or lost) and keeps the meeting notes. */
export const PATCH = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const changes = LeadUpdateSchema.parse(await req.json().catch(() => ({})));
  return json({ lead: serialize(await updateLead(params.id, changes)) });
});

export const DELETE = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  await deleteLead(params.id);
  return json({ deleted: true });
});
