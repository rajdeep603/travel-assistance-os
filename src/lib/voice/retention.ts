import type { Prisma } from "@prisma/client";
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

const OPEN_STATUSES = ["QUEUED", "RINGING", "IN_PROGRESS"] as const;
/** A phone call still "open" this long after it started missed Twilio's status callback. */
const PHONE_STALE_MS = 2 * 60 * 60 * 1000;

/**
 * Closes calls a previous gateway process left open (it was killed mid-call).
 * Browser sessions live only inside the gateway, so any still open when it
 * starts are over; phone calls normally close through Twilio's status
 * callback, so only ones open for hours are closed. The end time is the
 * record's last update, the closest thing to when the session stopped.
 */
export async function closeOrphanedCalls(startedAt = new Date()): Promise<number> {
  const orphans = await prisma.call.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      OR: [
        { channel: "BROWSER", createdAt: { lt: startedAt } },
        { channel: "PHONE", createdAt: { lt: new Date(startedAt.getTime() - PHONE_STALE_MS) } },
      ],
    },
    select: { id: true, answeredAt: true, updatedAt: true, outcome: true },
  });
  for (const call of orphans) {
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: call.answeredAt ? "COMPLETED" : "FAILED",
        endedAt: call.updatedAt,
        durationSec: call.answeredAt ? Math.max(0, Math.round((call.updatedAt.getTime() - call.answeredAt.getTime()) / 1000)) : null,
        outcome: {
          ...((call.outcome as Record<string, unknown> | null) ?? {}),
          endReason: "session lost when the voice service restarted",
        } as Prisma.InputJsonValue,
      },
    });
  }
  return orphans.length;
}
