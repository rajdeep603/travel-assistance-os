import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { getOperator } from "@/lib/auth/session";
import { applyClaimAction } from "@/lib/services/claims";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["APPROVE", "REQUEST_INFO", "ESCALATE"]),
  note: z.string().max(500).optional(),
});

/** Reviewer actions: Approve / Request Information / Escalate. */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: { id: string } }) => {
    const body = bodySchema.parse(
      await req.json().catch(() => {
        throw badRequest("Expected JSON body { action }.");
      })
    );
    const claim = await prisma.claim.findFirst({
      where: { OR: [{ id: params.id }, { ref: params.id.toUpperCase() }] },
      select: { id: true },
    });
    if (!claim) throw notFound("Claim");
    const operator = (await getOperator(req)) ?? undefined;
    const updated = await applyClaimAction(claim.id, body.action, body.note, operator);
    return json({ claim: serialize(updated) });
  }
);
