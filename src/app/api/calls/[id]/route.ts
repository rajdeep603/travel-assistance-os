import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { maskPhone } from "@/lib/format";
import { getAgent } from "@/lib/voice/agents/registry";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (_req: Request, { params }: { params: { id: string } }) => {
    const call = await prisma.call.findFirst({
      where: { OR: [{ id: params.id }, { ref: params.id.toUpperCase() }] },
      include: {
        conversation: true,
        case: { select: { id: true, ref: true, title: true, status: true, priority: true } },
      },
    });
    if (!call) throw notFound("Call");
    return json({
      call: serialize({
        ...call,
        fromNumber: maskPhone(call.fromNumber),
        toNumber: maskPhone(call.toNumber),
        agentLabel: getAgent(call.agentProfile)?.label ?? call.agentProfile,
      }),
    });
  }
);
