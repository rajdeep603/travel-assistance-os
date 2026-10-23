import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { withRef } from "@/lib/refs";
import { escapeXml, publicBase, readTwilioRequest, twiml, withTwiml } from "@/lib/twilio-webhook";
import { callerNumber } from "@/lib/services/telephony";
import { getAgent } from "@/lib/voice/agents/registry";
import { voiceLanguage } from "@/lib/voice/languages";

export const dynamic = "force-dynamic";

/**
 * Twilio "A call comes in" webhook for the hotline number, and for the SIP
 * domain a contact centre sends overflow calls to: records the call
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

  // A call a contact centre passes over SIP (Genesys Cloud BYOC, Avaya, a PBX) can
  // carry the case and the caller's language in custom headers, so the agent
  // starts with the context the contact centre already has.
  const sipCaseRef = (p["SipHeader_X-Case-Ref"] ?? p["SipHeader_X-CareTrail-Case"] ?? "").trim().toUpperCase();
  const sipCase = sipCaseRef ? await prisma.case.findUnique({ where: { ref: sipCaseRef }, select: { id: true } }) : null;
  const sipLanguage = voiceLanguage(p["SipHeader_X-Language"] ?? null)?.name ?? null;

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
          fromNumber: callerNumber(p.From),
          toNumber: callerNumber(p.To),
          caseId: sipCase?.id ?? null,
          language: sipLanguage,
        },
      })
    ));

  const ticket = await signToken({ kind: "twilio-media", callId: call.id, profile: profile.id }, gatewaySecret(), 300);
  const streamUrl = `${publicBase(req).replace(/^http/, "ws")}/ws/twilio`;
  return twiml(
    `<Connect><Stream url="${escapeXml(streamUrl)}"><Parameter name="ticket" value="${escapeXml(ticket)}"/></Stream></Connect>`
  );
});
