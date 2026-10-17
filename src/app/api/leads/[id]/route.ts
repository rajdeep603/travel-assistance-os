import { json, serialize, withErrorHandling } from "@/lib/api";
import { LeadStatusSchema, deleteLead, getLead, setLeadStatus } from "@/lib/services/leads";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** A lead with the inputs its quotation was built from. */
export const GET = withErrorHandling(async (_req: Request, { params }: Ctx) => json({ lead: serialize(await getLead(params.id)) }));

/** Moves a lead along: new, contacted, won or lost. */
export const PATCH = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { status } = LeadStatusSchema.parse(await req.json().catch(() => ({})));
  return json({ lead: serialize(await setLeadStatus(params.id, status)) });
});

export const DELETE = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  await deleteLead(params.id);
  return json({ deleted: true });
});
