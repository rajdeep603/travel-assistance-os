import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { withRef } from "@/lib/refs";
import { escapeXml, publicBase, readTwilioRequest, twiml, withTwiml } from "@/lib/twilio-webhook";
import { getAgent } from "@/lib/voice/agents/registry";

export const dynamic = "force-dynamic";

/**
 * Twilio "A call comes in" webhook for the hotline number: records the call
 * and connects its audio to the voice gateway (bidirectional Media Stream).
 * The gateway authenticates the stream with the signed ticket parameter —
 * Twilio drops query strings from Stream URLs, so it travels as a <Parameter>.
 */
export const POST = withTwiml(async (req) => {
  const p = await readTwilioRequest(req);
  const profile = getAgent(env.hotlineAgent);
  if (!profile) throw new Error(`HOTLINE_AGENT "${env.hotlineAgent}" is not a known agent profile`);

  const active = await prisma.call.count({
    where: {
      channel: "PHONE",
      status: { in: ["RINGING", "IN_PROGRESS"] },
      startedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    },
  });
  if (active >= env.maxConcurrentCalls) {
    return twiml(
      `<Say voice="Polly.Joanna">All our AI assistance lines are busy right now. Please call again in a few minutes. In a medical emergency, hang up and call one one two.</Say><Hangup/>`
    );
  }

  // Twilio retries webhooks; one CallSid is one Call.
  const call =
    (await prisma.call.findUnique({ where: { twilioCallSid: p.CallSid } })) ??
    (await withRef("call", (ref) =>
      prisma.call.create({
        data: {
          ref,
          direction: "INBOUND",
          channel: "PHONE",
          agentProfile: profile.id,
          status: "RINGING",
          twilioCallSid: p.CallSid,
          fromNumber: p.From ?? null,
          toNumber: p.To ?? null,
        },
      })
    ));

  const ticket = await signToken({ kind: "twilio-media", callId: call.id, profile: profile.id }, gatewaySecret(), 300);
  const streamUrl = `${publicBase(req).replace(/^http/, "ws")}/ws/twilio`;
  return twiml(
    `<Connect><Stream url="${escapeXml(streamUrl)}"><Parameter name="ticket" value="${escapeXml(ticket)}"/></Stream></Connect>`
  );
});
