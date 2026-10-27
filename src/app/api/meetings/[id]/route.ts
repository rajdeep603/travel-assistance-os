import { json, serialize, withErrorHandling } from "@/lib/api";
import { CallSlotSchema, cancelCall, rescheduleCall } from "@/lib/services/lead-meetings";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** Moves a Teams call to another time; Outlook sends everyone the update. */
export const PATCH = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const slot = CallSlotSchema.parse(await req.json().catch(() => ({})));
  const { meeting, lead } = await rescheduleCall(params.id, slot);
  return json({ meeting: serialize(meeting), lead: serialize(lead) });
});

/** Cancels a Teams call for everyone invited; the record stays on the lead. */
export const DELETE = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { meeting, lead } = await cancelCall(params.id);
  return json({ meeting: serialize(meeting), lead: serialize(lead) });
});
