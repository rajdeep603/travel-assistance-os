import { json, withErrorHandling } from "@/lib/api";
import { requireApiCaller } from "@/lib/auth/api-keys";
import { ApiError, badRequest } from "@/lib/errors";
import { normalizeNumber } from "@/lib/services/approved-numbers";
import { getTelephony } from "@/lib/services/telephony";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/phone-lookup?number=+1…&lineType=1: whether a number is real and
 * well formed (free), and with lineType what kind of line it is (paid per lookup).
 */
export const GET = withErrorHandling(async (req: Request) => {
  await requireApiCaller(req);
  const u = new URL(req.url);
  const number = normalizeNumber(u.searchParams.get("number") ?? "");
  if (!/^\+\d{6,15}$/.test(number)) throw badRequest("Send the number in international format, e.g. +14075550123.");
  const telephony = getTelephony();
  if (!telephony.configured || !telephony.lookup) throw new ApiError("Phone lookup isn't set up on this server.", 503, "LOOKUP_NOT_CONFIGURED");
  const result = await telephony.lookup(number, { lineType: u.searchParams.get("lineType") === "1" });
  return json({ lookup: result });
});
