import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { requireApiCaller } from "@/lib/auth/api-keys";
import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, badRequest } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { getAgent } from "@/lib/voice/agents/registry";
import { gatewayBase } from "@/lib/voice/gateway-url";
import { voiceLanguage } from "@/lib/voice/languages";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** An agent that runs in a browser ("inbound-msh-member-line"…). */
  agent: z.string().min(1).max(60),
  /** Language the agent opens in (English name or ISO code); detected otherwise. */
  language: z.string().max(40).optional(),
  /** The agent's brief. Required for API-only agents. Keys starting with "_" never reach the agent's instructions. */
  brief: z.record(z.string(), z.unknown()).optional(),
  /** Your own reference, returned on the call and in its call.completed webhook. */
  clientRef: z.string().max(80).optional(),
  /** Names on this call the recogniser should expect (members, providers, places). */
  keyterms: z.array(z.string().max(60)).max(40).optional(),
});

/**
 * POST /api/v1/sessions: starts a browser voice session with one of the
 * agents for a client app (a member talking to the member line from the
 * client's own page). The browser connects to the returned WebSocket URL
 * within a minute (same protocol as CareTrail's Voice Agents page: send
 * {type:"audio",data} PCM16 24 kHz base64, {type:"played",mark},
 * {type:"hangup"}; receive audio, clear, mark, transcript, tool and the
 * agent's own events). The page's origin must be in the gateway's
 * VOICE_ALLOWED_ORIGINS. The result arrives as a call.completed webhook.
 */
export const POST = withErrorHandling(async (req: Request) => {
  const caller = await requireApiCaller(req);
  if (!env.xaiApiKey) throw new ApiError("Voice is not configured on this server (XAI_API_KEY is missing).", 503, "VOICE_NOT_CONFIGURED");
  const body = Body.parse(await req.json().catch(() => ({})));
  const profile = getAgent(body.agent);
  if (!profile || profile.internal || profile.id === "interpreter" || !profile.channels.includes("BROWSER")) throw badRequest("Unknown voice agent.");
  if (profile.requiresCase) throw badRequest(`${profile.label} calls about a case: start it from CareTrail.`);
  if (profile.apiOnly && !body.brief) throw badRequest(`${profile.label} needs a brief.`);

  const keyterms = (body.keyterms ?? []).map((k) => k.trim()).filter(Boolean);
  const call = await withRef("call", (ref) =>
    prisma.call.create({
      data: {
        ref,
        direction: profile.direction === "outbound" ? "OUTBOUND" : "INBOUND",
        channel: "BROWSER",
        agentProfile: profile.id,
        placedBy: `api:${caller.name}`,
        language: voiceLanguage(body.language)?.name ?? null,
        outcome: {
          ...(body.brief ? { brief: body.brief } : {}),
          ...(body.clientRef ? { clientRef: body.clientRef } : {}),
          ...(keyterms.length ? { keyterms } : {}),
        } as Prisma.InputJsonValue,
      },
    })
  );
  const ticket = await signToken({ kind: "browser-voice", callId: call.id, profile: profile.id }, gatewaySecret(), 60);
  return json(
    {
      call: { id: call.id, ref: call.ref, status: call.status, agent: profile.id },
      url: `${gatewayBase(req)}/ws/voice?ticket=${encodeURIComponent(ticket)}`,
    },
    { status: 201 }
  );
});
