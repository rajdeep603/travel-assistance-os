import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { requireApiCaller } from "@/lib/auth/api-keys";
import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, badRequest } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { placeOutboundCall } from "@/lib/services/outbound-calls";
import { gatewayBase } from "@/lib/voice/gateway-url";
import { INTERPRETER_LANGUAGES } from "@/lib/voice/interpreter-prompt";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** E.164; must be approved for AI calls (POST /api/v1/approved-numbers). */
  to: z.string().min(6).max(24),
  /** The other side's language, as a code from INTERPRETER_LANGUAGES ("ar", "ru", "es-ES", "tr"…). The browser side speaks English. */
  language: z.string().min(2).max(8),
  /** Your own reference, returned in the call.completed webhook of the phone leg. */
  clientRef: z.string().max(80).optional(),
  /** What the conversation is ("a debt collector speaking with a former patient about a hospital invoice"); a hospital call otherwise. */
  context: z.string().max(200).optional(),
  /** Who is calling, for the line the other side hears first ("Hello, I'm calling from Global Excel…"). */
  client: z.string().max(80).optional(),
});

/**
 * POST /api/v1/interpreter: starts an interpreted call for a client app.
 * CareTrail dials the number; the client's browser joins through the returned
 * WebSocket URL (same protocol as the Call Center's interpreter card: send
 * {type:"audio",data} PCM16 24 kHz base64 and {type:"played",mark}; receive
 * audio, clear, mark, bridge_status and caption events). The browser's origin
 * must be in the gateway's VOICE_ALLOWED_ORIGINS.
 */
export const POST = withErrorHandling(async (req: Request) => {
  const caller = await requireApiCaller(req);
  if (!env.xaiApiKey) throw new ApiError("Voice is not configured on this server (XAI_API_KEY is missing).", 503, "VOICE_NOT_CONFIGURED");
  const body = Body.parse(await req.json().catch(() => ({})));
  const code = INTERPRETER_LANGUAGES[body.language] ? body.language : body.language === "es" ? "es-ES" : null;
  if (!code || code === "en") throw badRequest(`Choose the other side's language: ${Object.keys(INTERPRETER_LANGUAGES).filter((c) => c !== "en").join(", ")}.`);
  const bridgeId = randomUUID();
  const placedBy = `api:${caller.name}`;

  // The phone leg is placed first; it fails fast on allowlist/telephony problems.
  const phoneCall = await placeOutboundCall({
    profileId: "interpreter",
    to: body.to,
    placedBy,
    bridgeId,
    amd: false,
    clientRef: body.clientRef ?? null,
    extraOutcome: { languages: { manager: "en", hospital: code }, ...(body.context ? { context: body.context } : {}), ...(body.client ? { client: body.client } : {}) },
  });
  const managerCall = await withRef("call", (ref) =>
    prisma.call.create({
      data: {
        ref,
        direction: "OUTBOUND",
        channel: "BROWSER",
        agentProfile: "interpreter",
        status: "RINGING",
        placedBy,
        bridgeId,
        outcome: (body.clientRef ? { clientRef: body.clientRef } : {}) as Prisma.InputJsonValue,
      },
    })
  );
  const ticket = await signToken({ kind: "interpreter-manager", bridgeId }, gatewaySecret(), 120);
  return json(
    {
      bridgeId,
      calls: { manager: managerCall.ref, phone: phoneCall.ref },
      languages: ["English", INTERPRETER_LANGUAGES[code]],
      url: `${gatewayBase(req)}/ws/interpreter?ticket=${encodeURIComponent(ticket)}`,
    },
    { status: 201 }
  );
});
