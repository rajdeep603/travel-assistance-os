import type { Prisma } from "@prisma/client";
import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getTelephony } from "@/lib/services/telephony";
import { readTwilioRequest, withTwiml } from "@/lib/twilio-webhook";

export const dynamic = "force-dynamic";

/**
 * Asynchronous answering-machine detection result for outbound calls. A
 * machine means the live agent switches to leaving a short voicemail; a fax
 * line is hung up.
 */
export const POST = withTwiml(async (req) => {
  const p = await readTwilioRequest(req);
  const callId = new URL(req.url).searchParams.get("callId") ?? "";
  const answeredBy = p.AnsweredBy ?? "unknown";
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (call) {
    const outcome = { ...((call.outcome as Record<string, unknown>) ?? {}), answeredBy };
    await prisma.call.update({ where: { id: call.id }, data: { outcome: outcome as Prisma.InputJsonValue } });
    if (answeredBy === "fax") {
      await getTelephony().hangup(p.CallSid).catch(() => undefined);
    } else if (answeredBy.startsWith("machine")) {
      // Tell the live session (in the gateway) to leave a voicemail.
      const token = await signToken({ kind: "internal" }, gatewaySecret(), 30);
      await fetch(`${env.voiceGatewayInternalUrl}/internal/calls/${encodeURIComponent(call.id)}/answered-by`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ answeredBy }),
      }).catch((err) => console.warn(`[amd] couldn't reach the gateway for ${call.ref}:`, err instanceof Error ? err.message : err));
    }
  }
  return new Response(null, { status: 204 });
});
