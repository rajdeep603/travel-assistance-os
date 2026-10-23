import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { handoffByToken, partnerRespond } from "@/lib/services/network";

export const dynamic = "force-dynamic";

/** What the partner sees behind its secure link (no sign-in: the token is the credential). */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { token: string } }) => {
  const h = await handoffByToken(params.token);
  return json({
    handoff: serialize({ ref: h.ref, status: h.status, scope: h.scope, pack: h.pack, updates: h.updates, respondBy: h.respondBy, partner: { name: h.partner.name } }),
  });
});

const Body = z.object({
  action: z.enum(["ACCEPT", "DECLINE", "UPDATE", "COMPLETE"]),
  note: z.string().trim().max(2000).optional(),
  eta: z.string().trim().max(80).optional(),
  name: z.string().trim().max(80).optional(),
});

/** The partner accepts, declines, posts an update or completes the work. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  const h = await partnerRespond(params.token, body);
  return json({ handoff: serialize({ ref: h.ref, status: h.status, updates: h.updates }) });
});
