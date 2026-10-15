import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { maskPhone } from "@/lib/format";
import { getAgent } from "@/lib/voice/agents/registry";

export const dynamic = "force-dynamic";

/** Recent voice sessions (phone and browser), newest first. */
export const GET = withErrorHandling(async () => {
  const calls = await prisma.call.findMany({
    orderBy: { startedAt: "desc" },
    take: 60,
    include: { case: { select: { id: true, ref: true } } },
  });
  return json({
    calls: serialize(
      calls.map((c) => ({
        ...c,
        fromNumber: maskPhone(c.fromNumber),
        toNumber: maskPhone(c.toNumber),
        agentLabel: getAgent(c.agentProfile)?.label ?? c.agentProfile,
      }))
    ),
  });
});
