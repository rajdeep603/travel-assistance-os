import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { ApiError, badRequest, forbidden } from "@/lib/errors";
import { maskPhone } from "@/lib/format";
import { isAllowedNumber, normalizeNumber } from "@/lib/services/outbound-calls";
import { getTelephony } from "@/lib/services/telephony";

export const dynamic = "force-dynamic";

const Body = z.object({ to: z.string().max(40) });

/**
 * "Ring my phone": the hotline calls an approved number and, when it is
 * answered, hands the call to the same inbound webhook a dialled-in call
 * reaches, so the hotline agent greets exactly as it would have. For places
 * where the hotline number can't be dialled (toll-free from abroad, roaming
 * SIMs that block international calls).
 */
export const POST = withErrorHandling(async (req: Request) => {
  const { to: raw } = Body.parse(await req.json().catch(() => ({})));
  const to = normalizeNumber(raw);
  if (!/^\+\d{8,15}$/.test(to)) throw badRequest("Enter the number in international format, e.g. +905321234567.");
  if (!(await isAllowedNumber(to))) throw forbidden(`${maskPhone(to)} isn't on the list of numbers AI agents may call. Approve it first (Add a number).`);
  const telephony = getTelephony();
  const base = env.publicBaseUrl;
  if (!telephony.configured || !base) throw new ApiError("Telephony is not configured on this server.", 503, "TELEPHONY_NOT_CONFIGURED");
  const operator = await getOperator(req);
  try {
    const { sid } = await telephony.placeCall({ to, url: `${base}/api/twilio/voice/inbound`, statusCallback: `${base}/api/twilio/voice/status` });
    console.log(`[ring-me] ${operator ?? "someone"} asked the hotline to ring ${maskPhone(to)} (${sid})`);
    return json({ sid, to: maskPhone(to) }, { status: 201 });
  } catch (err) {
    console.error("[ring-me] placing the call failed:", err);
    throw new ApiError("The call could not be placed. Check the number and the telephony configuration.", 502, "CALL_FAILED");
  }
});
