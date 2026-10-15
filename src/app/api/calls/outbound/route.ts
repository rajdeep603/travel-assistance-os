import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { badRequest } from "@/lib/errors";
import { placeOutboundCall } from "@/lib/services/outbound-calls";

export const dynamic = "force-dynamic";

const Body = z.object({
  profile: z.string().min(1),
  caseId: z.string().optional(),
  to: z.string().min(6).max(24),
});

/** Places an outbound AI call (operator action; allowlisted numbers only). */
export const POST = withErrorHandling(async (req: Request) => {
  const body = Body.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON { profile, caseId, to }.");
    })
  );
  const call = await placeOutboundCall({
    profileId: body.profile,
    caseId: body.caseId,
    to: body.to,
    placedBy: await getOperator(req),
  });
  return json({ call: serialize({ id: call.id, ref: call.ref, status: call.status }) }, { status: 201 });
});
