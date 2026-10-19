import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { deleteDocument } from "@/lib/services/erase";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (_req: Request, { params }: { params: { id: string } }) => {
    const document = await prisma.document.findUnique({
      where: { id: params.id },
      include: { extraction: true, patient: true, case: true, claim: true, billReview: true },
    });
    if (!document) throw notFound("Document");
    return json({ document: serialize(document) });
  }
);

/** Removes it with everything derived from it, e.g. a visitor's own document after a meeting. */
export const DELETE = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  await deleteDocument(params.id);
  return json({ deleted: true });
});
