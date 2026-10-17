import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, badRequest, notFound, unauthorized } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { createThread, voiceBrief } from "@/lib/services/assistant-history";
import { DEFAULT_BROWSER_AGENT, getAgent } from "@/lib/voice/agents/registry";
import { gatewayBase } from "@/lib/voice/gateway-url";
import { voiceLanguage } from "@/lib/voice/languages";

export const dynamic = "force-dynamic";

const Body = z.object({
  profile: z.string().optional(),
  caseId: z.string().optional(),
  /** Language the agent opens in (English name or ISO code); detected otherwise. */
  language: z.string().max(40).optional(),
  /** Internal assistant: the conversation voice mode joins (its earlier turns go to the agent; the transcript is saved into it); a new one without it. */
  threadId: z.string().max(40).optional(),
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
  // The interpreter bridges a case manager and a hospital; it starts from the Call Center's interpreter card.
  if (profile.id === "interpreter") throw badRequest("Start the interpreter from the Call Center's interpreter card.");

  if (body.caseId) {
    const exists = await prisma.case.findUnique({ where: { id: body.caseId }, select: { id: true } });
    if (!exists) throw notFound("Case");
  }
  if (profile.requiresCase && !body.caseId) throw badRequest("This agent calls about a case: open it from a case.");
  const operator = await getOperator(req);
  let outcome: Record<string, unknown> | null = null;
  let thread: { id: string } | null = null;
  if (profile.internal) {
    if (!operator) throw unauthorized();
    thread = { id: body.threadId ?? (await createThread(operator)).id };
    outcome = { assistantThreadId: thread.id, brief: await voiceBrief(thread.id, operator) };
  } else if (body.caseId && profile.buildBrief) {
    // An outbound agent rehearsed in the browser gets the same brief as a phone call.
    outcome = { brief: await profile.buildBrief(body.caseId) };
  }

  const call = await withRef("call", (ref) =>
    prisma.call.create({
      data: {
        ref,
        direction: profile.direction === "outbound" ? "OUTBOUND" : "INBOUND",
        channel: "BROWSER",
        agentProfile: profile.id,
        caseId: body.caseId ?? null,
        placedBy: operator,
        language: voiceLanguage(body.language)?.name ?? null,
        ...(outcome ? { outcome: outcome as Prisma.InputJsonValue } : {}),
      },
    })
  );

  const ticket = await signToken({ kind: "browser-voice", callId: call.id, profile: profile.id }, gatewaySecret(), 60);
  return json(
    {
      call: { id: call.id, ref: call.ref },
      agent: { id: profile.id, label: profile.label },
      url: `${gatewayBase(req)}/ws/voice?ticket=${encodeURIComponent(ticket)}`,
      ...(thread ? { thread } : {}),
    },
    { status: 201 }
  );
});
