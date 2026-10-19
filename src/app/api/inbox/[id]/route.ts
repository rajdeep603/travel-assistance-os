import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { deleteInboundMessage } from "@/lib/services/erase";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  const message = await prisma.inboundMessage.findFirst({
    where: { OR: [{ id: params.id }, { ref: params.id.toUpperCase() }] },
    include: {
      matchedCase: { select: { id: true, ref: true, title: true, status: true } },
      documents: {
        include: { extraction: true, claim: { select: { id: true, ref: true, status: true } } },
        orderBy: { createdAt: "asc" },
      },
      replies: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!message) throw notFound("Message");
  return json({ message: serialize(message) });
});

/** Removes it with everything derived from it, e.g. a visitor's own document after a meeting. */
export const DELETE = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  await deleteInboundMessage(params.id);
  return json({ deleted: true });
});
