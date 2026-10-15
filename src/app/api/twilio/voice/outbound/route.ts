import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db";
import { escapeXml, publicBase, readTwilioRequest, twiml, withTwiml } from "@/lib/twilio-webhook";

export const dynamic = "force-dynamic";

/** TwiML for an outbound AI call once it is answered: stream it to the gateway. */
export const POST = withTwiml(async (req) => {
  const p = await readTwilioRequest(req);
  const callId = new URL(req.url).searchParams.get("callId") ?? "";
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call || (call.twilioCallSid && call.twilioCallSid !== p.CallSid)) return twiml("<Hangup/>");
  if (!call.twilioCallSid) await prisma.call.update({ where: { id: call.id }, data: { twilioCallSid: p.CallSid } });

  const ticket = await signToken({ kind: "twilio-media", callId: call.id, profile: call.agentProfile }, gatewaySecret(), 300);
  const streamUrl = `${publicBase(req).replace(/^http/, "ws")}/ws/twilio`;
  return twiml(
    `<Connect><Stream url="${escapeXml(streamUrl)}"><Parameter name="ticket" value="${escapeXml(ticket)}"/></Stream></Connect>`
  );
});
