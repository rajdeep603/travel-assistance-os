import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { badRequest, notFound } from "@/lib/errors";
import { providerByRef, sendPriceLink } from "@/lib/services/provider-validation";

export const dynamic = "force-dynamic";

const Body = z.object({
  channel: z.enum(["sms", "email", "none"]).default("none"),
  to: z.string().trim().max(120).optional(),
});

/** A personal price-list link for the practice: sent by text or e-mail, or shown as a QR code. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { ref: string } }) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  const p = await providerByRef(params.ref);
  if (!p) throw notFound("Provider");
  if (body.channel !== "none" && !body.to) throw badRequest(body.channel === "sms" ? "Enter the mobile number to text." : "Enter the e-mail address.");
  const result = await sendPriceLink(p, body.channel, body.to ?? null, await getOperator(req));
  return json(result, { status: 201 });
});
