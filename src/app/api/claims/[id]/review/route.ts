import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { reviewClaim } from "@/lib/services/claims";

export const dynamic = "force-dynamic";

/** Re-runs the AI review pipeline (completeness check + summary) for a claim. */
export const POST = withErrorHandling(
  async (_req: Request, { params }: { params: { id: string } }) => {
    const claim = await prisma.claim.findFirst({
      where: { OR: [{ id: params.id }, { ref: params.id.toUpperCase() }] },
      select: { id: true },
    });
    if (!claim) throw notFound("Claim");
    const reviewed = await reviewClaim(claim.id);
    return json({ claim: serialize(reviewed) });
  }
);
