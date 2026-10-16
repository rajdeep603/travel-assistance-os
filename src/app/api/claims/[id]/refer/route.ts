import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { referClaimToFraudTeam } from "@/lib/services/claims";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ note: z.string().max(500).optional() });

/** A reviewer refers the claim to the fraud team. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const { note } = bodySchema.parse(await req.json().catch(() => ({})));
  const claim = await prisma.claim.findFirst({ where: { OR: [{ id: params.id }, { ref: params.id.toUpperCase() }] }, select: { id: true } });
  if (!claim) throw notFound("Claim");
  const updated = await referClaimToFraudTeam(claim.id, (await getOperator(req)) ?? "operator", note);
  return json({ claim: serialize(updated) });
});
