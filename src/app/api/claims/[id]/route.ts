import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (_req: Request, { params }: { params: { id: string } }) => {
    const claim = await prisma.claim.findFirst({
      where: { OR: [{ id: params.id }, { ref: params.id.toUpperCase() }] },
      include: {
        patient: true,
        case: true,
        documents: { include: { extraction: true } },
      },
    });
    if (!claim) throw notFound("Claim");
    return json({ claim: serialize(claim) });
  }
);
