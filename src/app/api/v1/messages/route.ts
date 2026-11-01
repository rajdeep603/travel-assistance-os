import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { requireApiCaller } from "@/lib/auth/api-keys";
import { ApiError } from "@/lib/errors";
import { isAllowedNumber, normalizeNumber } from "@/lib/services/approved-numbers";
import { getEmailService } from "@/lib/services/email";
import { getTelephony } from "@/lib/services/telephony";

export const dynamic = "force-dynamic";

const Body = z.object({
  channel: z.enum(["sms", "email"]),
  /** E.164 for sms (an approved number), an address for email. */
  to: z.string().min(3).max(120),
  text: z.string().min(1).max(2000),
  subject: z.string().max(200).optional(),
});

/** POST /api/v1/messages: sends a text message (to an approved number) or an e-mail on the caller's behalf. */
export const POST = withErrorHandling(async (req: Request) => {
  await requireApiCaller(req);
  const body = Body.parse(await req.json().catch(() => ({})));
  if (body.channel === "sms") {
    const to = normalizeNumber(body.to);
    if (!/^\+\d{8,15}$/.test(to)) throw new ApiError("Enter the number in international format, e.g. +905321234567.", 400, "BAD_REQUEST");
    if (!(await isAllowedNumber(to))) throw new ApiError(`${to.slice(0, 3)}… isn't on the list of numbers that may be messaged. Approve it first (POST /api/v1/approved-numbers).`, 403, "FORBIDDEN");
    const telephony = getTelephony();
    if (!telephony.configured) throw new ApiError("Text messages aren't set up on this server.", 503, "SMS_NOT_CONFIGURED");
    const { sid } = await telephony.sendSms(to, body.text);
    return json({ sent: true, channel: "sms", id: sid }, { status: 201 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.to)) throw new ApiError("Enter a valid e-mail address.", 400, "BAD_REQUEST");
  const email = getEmailService();
  if (!email.configured) throw new ApiError("E-mail isn't set up on this server.", 503, "EMAIL_NOT_CONFIGURED");
  const { id } = await email.send({ to: body.to, subject: body.subject ?? "A message from the provider network team", text: body.text });
  return json({ sent: true, channel: "email", id }, { status: 201 });
});
