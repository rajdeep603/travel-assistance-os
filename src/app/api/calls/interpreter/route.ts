import { randomUUID } from "node:crypto";
import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, badRequest, notFound } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { placeOutboundCall } from "@/lib/services/outbound-calls";
import { gatewayBase } from "@/lib/voice/gateway-url";
import { INTERPRETER_LANGUAGES } from "@/lib/voice/interpreter";

export const dynamic = "force-dynamic";

const Body = z.object({
  caseId: z.string().optional(),
  hospitalNumber: z.string().min(6).max(24),
  hospitalLanguage: z.string().default("tr"),
});

/**
 * Starts an interpreted call: dials the hospital and returns a ticket for the
 * case manager's browser to join. The gateway connects the two legs through
 * two translation sessions once the hospital answers.
 */
export const POST = withErrorHandling(async (req: Request) => {
  if (!env.xaiApiKey) throw new ApiError("Voice is not configured on this server (XAI_API_KEY is missing).", 503, "VOICE_NOT_CONFIGURED");
  const body = Body.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON { caseId, hospitalNumber, hospitalLanguage }.");
    })
  );
  if (!INTERPRETER_LANGUAGES[body.hospitalLanguage] || body.hospitalLanguage === "en") {
    throw badRequest("Choose the hospital's language.");
  }
  if (body.caseId && !(await prisma.case.findUnique({ where: { id: body.caseId }, select: { id: true } }))) {
    throw notFound("Case");
  }
  const operator = await getOperator(req);
  const bridgeId = randomUUID();

  // The hospital leg is placed first; it fails fast on allowlist/telephony problems.
  const hospitalCall = await placeOutboundCall({
    profileId: "interpreter",
    caseId: body.caseId,
    to: body.hospitalNumber,
    placedBy: operator,
    bridgeId,
    amd: false,
    extraOutcome: { languages: { manager: "en", hospital: body.hospitalLanguage } },
  });
  const managerCall = await withRef("call", (ref) =>
    prisma.call.create({
      data: {
        ref,
        direction: "OUTBOUND",
        channel: "BROWSER",
        agentProfile: "interpreter",
        status: "RINGING",
        caseId: body.caseId ?? null,
        placedBy: operator,
        bridgeId,
      },
    })
  );

  const ticket = await signToken({ kind: "interpreter-manager", bridgeId }, gatewaySecret(), 120);
  return json(
    {
      bridgeId,
      calls: { manager: managerCall.ref, hospital: hospitalCall.ref },
      languages: ["English", INTERPRETER_LANGUAGES[body.hospitalLanguage]],
      url: `${gatewayBase(req)}/ws/interpreter?ticket=${encodeURIComponent(ticket)}`,
    },
    { status: 201 }
  );
});
