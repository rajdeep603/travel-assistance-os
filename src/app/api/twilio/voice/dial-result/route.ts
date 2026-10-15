import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readTwilioRequest, twiml, withTwiml } from "@/lib/twilio-webhook";

export const dynamic = "force-dynamic";

/**
 * <Dial action> for warm transfers: if nobody answered, tell the caller and
 * flag the case for an urgent call-back instead of leaving them in silence.
 */
export const POST = withTwiml(async (req) => {
  const p = await readTwilioRequest(req);
  const callId = new URL(req.url).searchParams.get("callId") ?? "";
  const answered = p.DialCallStatus === "completed" || p.DialCallStatus === "answered";
  if (answered) return twiml("<Hangup/>");

  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (call) {
    const outcome = { ...((call.outcome as Record<string, unknown>) ?? {}), transferFailed: p.DialCallStatus ?? "no-answer" };
    await prisma.call.update({ where: { id: call.id }, data: { outcome: outcome as Prisma.InputJsonValue } });
    if (call.caseId) {
      await prisma.case.update({
        where: { id: call.caseId },
        data: {
          priority: "CRITICAL",
          status: "ESCALATED",
          events: {
            create: {
              type: "CALL",
              title: `Transfer from ${call.ref} was not answered — urgent call-back needed`,
              body: `Dial status: ${p.DialCallStatus ?? "unknown"}.`,
              actor: "system",
            },
          },
        },
      });
    }
  }
  return twiml(
    `<Say voice="Polly.Joanna">I'm sorry, nobody could take the call just now. Your case is marked urgent and a member of our team will call you back within fifteen minutes. If your condition gets worse, call one one two.</Say><Hangup/>`
  );
});
