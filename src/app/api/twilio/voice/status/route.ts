import type { CallStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readTwilioRequest, withTwiml } from "@/lib/twilio-webhook";

export const dynamic = "force-dynamic";

const STATUS: Record<string, CallStatus> = {
  queued: "QUEUED",
  initiated: "QUEUED",
  ringing: "RINGING",
  "in-progress": "IN_PROGRESS",
  completed: "COMPLETED",
  busy: "BUSY",
  failed: "FAILED",
  "no-answer": "NO_ANSWER",
  canceled: "CANCELED",
};

/** Outcomes the voice session decided itself; carrier updates don't overwrite them. */
const SETTLED: CallStatus[] = ["COMPLETED", "TRANSFERRED", "VOICEMAIL", "FAILED"];

/** Twilio call-progress callbacks (inbound and outbound). */
export const POST = withTwiml(async (req) => {
  const p = await readTwilioRequest(req);
  const call = await prisma.call.findUnique({ where: { twilioCallSid: p.CallSid } });
  const status = STATUS[p.CallStatus ?? ""];
  if (call && status) {
    const final = ["COMPLETED", "BUSY", "FAILED", "NO_ANSWER", "CANCELED"].includes(status);
    await prisma.call.update({
      where: { id: call.id },
      data: {
        ...(SETTLED.includes(call.status) ? {} : { status }),
        ...(status === "IN_PROGRESS" && !call.answeredAt ? { answeredAt: new Date() } : {}),
        ...(final && !call.endedAt ? { endedAt: new Date() } : {}),
        ...(final && p.CallDuration ? { durationSec: Number(p.CallDuration) } : {}),
      },
    });
  }
  return new Response(null, { status: 204 });
});
