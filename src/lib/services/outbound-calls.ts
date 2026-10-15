import type { Call, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, badRequest, forbidden, notFound } from "@/lib/errors";
import { maskPhone } from "@/lib/format";
import { withRef } from "@/lib/refs";
import { getAgent } from "@/lib/voice/agents/registry";
import { getTelephony } from "./telephony";

// ---------------------------------------------------------------------------
// OutboundCallService: places AI calls through the telephony provider with
// the guards a real deployment needs — an allowlist of dialable numbers
// (toll fraud, demo safety), a concurrency cap,
// answering-machine detection, and one automatic retry when nobody answers.
// ---------------------------------------------------------------------------

export function normalizeNumber(n: string): string {
  return n.replace(/[^\d+]/g, "");
}

export function isAllowedNumber(n: string): boolean {
  return env.outboundAllowedNumbers.includes(normalizeNumber(n));
}

export interface PlaceCallInput {
  profileId: string;
  caseId?: string | null;
  to: string;
  placedBy: string | null;
  retryOf?: string;
  /** Pairs this call with another leg (interpreter bridge). */
  bridgeId?: string;
  /** Extra structured data stored on the call (e.g. interpreter languages). */
  extraOutcome?: Record<string, unknown>;
  /** Answering-machine detection (on by default). */
  amd?: boolean;
}

export async function placeOutboundCall(input: PlaceCallInput): Promise<Call> {
  const profile = getAgent(input.profileId);
  if (!profile || profile.direction !== "outbound") throw badRequest("Unknown outbound agent.");
  if (profile.requiresCase && !input.caseId) throw badRequest("This call needs a case to call about.");
  const to = normalizeNumber(input.to);
  if (!/^\+\d{8,15}$/.test(to)) throw badRequest("Enter the number in international format, e.g. +905321234567.");
  if (!isAllowedNumber(to)) {
    throw forbidden(`${maskPhone(to)} isn't on the list of numbers AI agents may call.`);
  }
  const telephony = getTelephony();
  if (!telephony.configured || !env.publicBaseUrl) {
    throw new ApiError("Telephony is not configured on this server.", 503, "TELEPHONY_NOT_CONFIGURED");
  }
  const active = await prisma.call.count({
    where: { channel: "PHONE", status: { in: ["QUEUED", "RINGING", "IN_PROGRESS"] }, startedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
  });
  if (active >= env.maxConcurrentCalls) {
    throw new ApiError("All AI lines are busy. Try again in a few minutes.", 429, "LINES_BUSY");
  }
  if (input.caseId && !(await prisma.case.findUnique({ where: { id: input.caseId }, select: { id: true } }))) {
    throw notFound("Case");
  }

  const brief = input.caseId && profile.buildBrief ? await profile.buildBrief(input.caseId) : null;
  const retries = input.retryOf
    ? (((await prisma.call.findUnique({ where: { id: input.retryOf } }))?.outcome as { retries?: number } | null)?.retries ?? 0) + 1
    : 0;

  const call = await withRef("call", (ref) =>
    prisma.call.create({
      data: {
        ref,
        direction: "OUTBOUND",
        channel: "PHONE",
        agentProfile: profile.id,
        status: "QUEUED",
        toNumber: to,
        fromNumber: telephony.fromNumber,
        caseId: input.caseId ?? null,
        placedBy: input.placedBy,
        bridgeId: input.bridgeId ?? null,
        outcome: {
          brief,
          retries,
          ...(input.retryOf ? { retryOf: input.retryOf } : {}),
          ...(input.extraOutcome ?? {}),
        } as Prisma.InputJsonValue,
      },
    })
  );

  const base = env.publicBaseUrl;
  try {
    const { sid } = await telephony.placeCall({
      to,
      url: `${base}/api/twilio/voice/outbound?callId=${encodeURIComponent(call.id)}`,
      statusCallback: `${base}/api/twilio/voice/status`,
      ...(input.amd === false ? {} : { amdCallback: `${base}/api/twilio/voice/amd?callId=${encodeURIComponent(call.id)}` }),
    });
    const placed = await prisma.call.update({ where: { id: call.id }, data: { twilioCallSid: sid, status: "RINGING" } });
    if (input.caseId) {
      await prisma.caseEvent.create({
        data: {
          caseId: input.caseId,
          type: "CALL",
          title: `${input.retryOf ? "Retry: " : ""}${profile.label} call ${call.ref} placed`,
          body: `Calling ${maskPhone(to)}.`,
          actor: input.placedBy ? `operator:${input.placedBy}` : "system",
        },
      });
    }
    return placed;
  } catch (err) {
    console.error(`[outbound] placing ${call.ref} failed:`, err);
    await prisma.call.update({ where: { id: call.id }, data: { status: "FAILED", endedAt: new Date() } });
    throw new ApiError("The call could not be placed. Check the number and the telephony configuration.", 502, "CALL_FAILED");
  }
}

/** Retries each unanswered/busy outbound call once, after OUTBOUND_RETRY_MINUTES. */
export async function retryUnansweredCalls(now = new Date()): Promise<number> {
  const due = await prisma.call.findMany({
    where: {
      direction: "OUTBOUND",
      channel: "PHONE",
      status: { in: ["NO_ANSWER", "BUSY"] },
      endedAt: { lt: new Date(now.getTime() - env.outboundRetryMinutes * 60_000), gte: new Date(now.getTime() - 24 * 60 * 60_000) },
    },
    take: 20,
  });
  let placed = 0;
  for (const call of due) {
    const outcome = (call.outcome as { retries?: number; retriedAs?: string } | null) ?? {};
    // Interpreter legs are live conversations; a retry would have no one on the other side.
    if ((outcome.retries ?? 0) >= 1 || outcome.retriedAs || !call.toNumber || call.bridgeId) continue;
    try {
      const retry = await placeOutboundCall({
        profileId: call.agentProfile,
        caseId: call.caseId,
        to: call.toNumber,
        placedBy: call.placedBy,
        retryOf: call.id,
      });
      await prisma.call.update({ where: { id: call.id }, data: { outcome: { ...outcome, retriedAs: retry.ref } as Prisma.InputJsonValue } });
      placed++;
    } catch (err) {
      // Transient (all lines busy): try again on the next sweep. Anything
      // else: give up rather than retry forever.
      const transient = err instanceof ApiError && err.code === "LINES_BUSY";
      if (!transient) {
        await prisma.call.update({
          where: { id: call.id },
          data: { outcome: { ...outcome, retriedAs: "failed" } as Prisma.InputJsonValue },
        });
      }
    }
  }
  return placed;
}
