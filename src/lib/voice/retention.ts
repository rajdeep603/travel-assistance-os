import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { maskPhone } from "@/lib/format";

// ---------------------------------------------------------------------------
// Real people call the demo line at a conference booth, so phone transcripts
// and caller numbers are personal data. After CALL_DATA_RETENTION_DAYS the
// transcript is erased and numbers are masked; the call record, its outcome
// and the case stay for reporting.
// ---------------------------------------------------------------------------

export async function purgeExpiredCallData(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - env.callRetentionDays * 24 * 60 * 60 * 1000);
  const expired = await prisma.call.findMany({
    where: {
      channel: "PHONE",
      endedAt: { lt: cutoff },
      OR: [{ fromNumber: { not: { contains: "•" } } }, { toNumber: { not: { contains: "•" } } }],
    },
    select: { id: true, fromNumber: true, toNumber: true, conversationId: true },
    take: 500,
  });
  for (const call of expired) {
    await prisma.$transaction([
      prisma.call.update({
        where: { id: call.id },
        data: { fromNumber: maskPhone(call.fromNumber), toNumber: maskPhone(call.toNumber) },
      }),
      ...(call.conversationId
        ? [
            prisma.conversation.update({
              where: { id: call.conversationId },
              data: { messages: [], state: undefined },
            }),
          ]
        : []),
    ]);
  }
  return expired.length;
}
