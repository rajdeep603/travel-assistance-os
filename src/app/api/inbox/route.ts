import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Inbound e-mails and faxes, newest first. */
export const GET = withErrorHandling(async () => {
  const messages = await prisma.inboundMessage.findMany({
    orderBy: { receivedAt: "desc" },
    take: 60,
    include: {
      matchedCase: { select: { id: true, ref: true } },
      _count: { select: { documents: true, replies: true } },
    },
  });
  return json({ messages: serialize(messages) });
});
