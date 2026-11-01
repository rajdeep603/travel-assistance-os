import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, badRequest, forbidden } from "@/lib/errors";
import { maskPhone } from "@/lib/format";
import { withRef } from "@/lib/refs";
import { isAllowedNumber, normalizeNumber } from "@/lib/services/outbound-calls";
import { getTelephony } from "@/lib/services/telephony";
import { getAgent } from "@/lib/voice/agents/registry";
import type { CallOpening } from "@/lib/voice/bridge";
import { demoStep, rehearsalNote } from "@/lib/voice/demo-runs";
import { voiceLanguage } from "@/lib/voice/languages";

export const dynamic = "force-dynamic";

const Body = z.object({
  to: z.string().max(40),
  /** The language the agent answers in (English name); detected from the caller otherwise. */
  language: z.string().max(40).optional(),
  /**
   * A demo step from the Voice Agents page: its own inbound agent takes the
   * call and stays quiet until the presenter, playing the caller, reads the
   * first line; the step's script is its context.
   */
  demo: z.object({ run: z.string().max(40), step: z.string().max(60) }).optional(),
});

/**
 * "Ring my phone": the hotline calls an approved number and, when it is
 * answered, hands the call to the same inbound webhook a dialled-in call
 * reaches, so the hotline agent greets exactly as it would. For places
 * where the hotline number can't be dialled (toll-free from abroad, roaming
 * SIMs that block international calls), and for demo steps on a real phone.
 */
export const POST = withErrorHandling(async (req: Request) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  const to = normalizeNumber(body.to);
  if (!/^\+\d{8,15}$/.test(to)) throw badRequest("Enter the number in international format, e.g. +905321234567.");
  if (!(await isAllowedNumber(to))) throw forbidden(`${maskPhone(to)} isn't on the list of numbers AI agents may call. Approve it first (Add a number).`);
  const telephony = getTelephony();
  const base = env.publicBaseUrl;
  if (!telephony.configured || !base) throw new ApiError("Telephony is not configured on this server.", 503, "TELEPHONY_NOT_CONFIGURED");

  const demo = body.demo ? demoStep(body.demo.run, body.demo.step) : null;
  if (body.demo && !demo) throw badRequest("Unknown demo step.");
  const profile = getAgent(demo ? demo.step.agentId : env.hotlineAgent);
  if (!profile || profile.direction !== "inbound") throw badRequest("This step isn't an inbound call; place it as an outbound call instead.");
  const opening: CallOpening | null = demo
    ? {
        wait: true,
        cue: `[The call has connected. ${rehearsalNote(demo.step)} They speak first: stay silent until they do, then answer as you would on a dialled-in call. Don't greet first.]`,
      }
    : null;

  const operator = await getOperator(req);
  // The call record exists before the phone rings, so the inbound webhook
  // (reached with ?callId=) picks the agent, language and opening from it.
  const call = await withRef("call", (ref) =>
    prisma.call.create({
      data: {
        ref,
        direction: "INBOUND",
        channel: "PHONE",
        agentProfile: profile.id,
        status: "QUEUED",
        fromNumber: to,
        toNumber: telephony.fromNumber,
        language: voiceLanguage(body.language)?.name ?? null,
        outcome: {
          rangThem: true,
          ...(opening ? { opening } : {}),
          ...(demo ? { demo: { run: demo.track.id, step: demo.step.id } } : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    })
  );
  try {
    const { sid } = await telephony.placeCall({
      to,
      url: `${base}/api/twilio/voice/inbound?callId=${encodeURIComponent(call.id)}`,
      statusCallback: `${base}/api/twilio/voice/status`,
    });
    await prisma.call.update({ where: { id: call.id }, data: { twilioCallSid: sid, status: "RINGING" } });
    console.log(`[ring-me] ${operator ?? "someone"} asked ${profile.label} to ring ${maskPhone(to)} (${sid}${demo ? `, demo ${demo.track.id}/${demo.step.id}` : ""})`);
    return json({ sid, to: maskPhone(to), call: serialize({ id: call.id, ref: call.ref }) }, { status: 201 });
  } catch (err) {
    console.error("[ring-me] placing the call failed:", err);
    await prisma.call.update({ where: { id: call.id }, data: { status: "FAILED", endedAt: new Date() } });
    throw new ApiError("The call could not be placed. Check the number and the telephony configuration.", 502, "CALL_FAILED");
  }
});
