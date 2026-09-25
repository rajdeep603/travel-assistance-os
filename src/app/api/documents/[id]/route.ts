import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (_req: Request, { params }: { params: { id: string } }) => {
    const document = await prisma.document.findUnique({
      where: { id: params.id },
      include: { extraction: true, patient: true, case: true, claim: true },
    });
    if (!document) throw notFound("Document");
    return json({ document: serialize(document) });
  }
);
