import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, badRequest, notFound } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { DEFAULT_BROWSER_AGENT, getAgent } from "@/lib/voice/agents/registry";
import { gatewayBase } from "@/lib/voice/gateway-url";

export const dynamic = "force-dynamic";

const Body = z.object({
  profile: z.string().optional(),
  caseId: z.string().optional(),
});

/**
 * Starts a browser voice session: records the Call and returns a short-lived
 * ticket the browser presents to the voice gateway.
 */
export const POST = withErrorHandling(async (req: Request) => {
  if (!env.xaiApiKey) {
    throw new ApiError(
      "Voice is not configured on this server (XAI_API_KEY is missing).",
      503,
      "VOICE_NOT_CONFIGURED"
    );
  }
  const body = Body.parse(await req.json().catch(() => ({})));
  const profile = getAgent(body.profile ?? DEFAULT_BROWSER_AGENT);
  if (!profile || !profile.channels.includes("BROWSER")) throw badRequest("Unknown voice agent.");

  if (body.caseId) {
    const exists = await prisma.case.findUnique({ where: { id: body.caseId }, select: { id: true } });
    if (!exists) throw notFound("Case");
  }

  const operator = await getOperator(req);
  const call = await withRef("call", (ref) =>
    prisma.call.create({
      data: {
        ref,
        direction: profile.direction === "outbound" ? "OUTBOUND" : "INBOUND",
        channel: "BROWSER",
        agentProfile: profile.id,
        caseId: body.caseId ?? null,
        placedBy: operator,
      },
    })
  );

  const ticket = await signToken({ kind: "browser-voice", callId: call.id, profile: profile.id }, gatewaySecret(), 60);
  return json(
    {
      call: { id: call.id, ref: call.ref },
      agent: { id: profile.id, label: profile.label },
      url: `${gatewayBase(req)}/ws/voice?ticket=${encodeURIComponent(ticket)}`,
    },
    { status: 201 }
  );
});
