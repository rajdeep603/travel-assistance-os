import { prisma } from "@/lib/db";
import { escapeXml, readTwilioRequest, twiml, withTwiml } from "@/lib/twilio-webhook";

export const dynamic = "force-dynamic";

/**
 * Played to the doctor / case manager when they pick up a warm transfer,
 * before the caller is connected: the AI's handoff summary.
 */
export const POST = withTwiml(async (req) => {
  await readTwilioRequest(req);
  const callId = new URL(req.url).searchParams.get("callId") ?? "";
  const call = await prisma.call.findUnique({ where: { id: callId }, include: { case: true } });
  const handoff = (call?.outcome as { handoff?: { summary?: string; reason?: string } } | null)?.handoff;
  const parts = [
    "Transfer from the AI assistance line.",
    handoff?.reason ? `Reason: ${handoff.reason}.` : "",
    handoff?.summary ?? "",
    call?.case ? `Case ${call.case.ref.replace("-", " ")}.` : "",
    "Connecting you now.",
  ].filter(Boolean);
  return twiml(`<Say voice="Polly.Joanna">${escapeXml(parts.join(" "))}</Say>`);
});
