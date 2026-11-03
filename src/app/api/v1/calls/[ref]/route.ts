import { json, withErrorHandling } from "@/lib/api";
import { requireApiCaller } from "@/lib/auth/api-keys";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { maskPhone } from "@/lib/format";
import { INTERNAL_AGENT_IDS } from "@/lib/voice/agents/ids";
import { getAgent } from "@/lib/voice/agents/registry";

export const dynamic = "force-dynamic";

/** GET /api/v1/calls/{ref}: a call's status, summary, what the agent recorded, and the transcript. */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { ref: string } }) => {
  await requireApiCaller(req);
  const call = await prisma.call.findFirst({
    where: { ref: params.ref.toUpperCase(), agentProfile: { notIn: INTERNAL_AGENT_IDS } },
    include: { conversation: { select: { messages: true } }, case: { select: { ref: true } } },
  });
  if (!call) throw notFound("Call");
  const outcome = (call.outcome as Record<string, unknown> | null) ?? {};
  // An interpreted call keeps its bilingual transcript on the browser leg; the phone leg is what the API caller holds.
  const sibling =
    !call.conversation && call.bridgeId
      ? await prisma.call.findFirst({ where: { bridgeId: call.bridgeId, id: { not: call.id } }, select: { conversation: { select: { messages: true } } } })
      : null;
  return json({
    call: {
      ref: call.ref,
      id: call.id,
      agent: call.agentProfile,
      agentLabel: getAgent(call.agentProfile)?.label ?? call.agentProfile,
      direction: call.direction,
      channel: call.channel,
      status: call.status,
      to: call.toNumber ? maskPhone(call.toNumber) : null,
      language: call.language,
      caseRef: call.case?.ref ?? null,
      clientRef: typeof outcome.clientRef === "string" ? outcome.clientRef : null,
      startedAt: call.startedAt,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
      durationSec: call.durationSec,
      summary: call.summary,
      outcome,
      transcript: ((call.conversation ?? sibling?.conversation)?.messages as { role: string; text: string; at: string }[] | null) ?? [],
    },
  });
});
