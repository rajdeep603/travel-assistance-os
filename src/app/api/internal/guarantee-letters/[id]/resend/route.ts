import { json, withErrorHandling } from "@/lib/api";
import { gatewaySecret, verifyToken } from "@/lib/auth/tokens";
import { ApiError } from "@/lib/errors";
import { resendLetter } from "@/lib/services/guarantee-letter";

export const dynamic = "force-dynamic";

/**
 * The voice gateway's way to re-send a letter: it can't render PDFs or read
 * stored files, so a voice agent's request runs here. Authenticated with a
 * short-lived token signed with the gateway secret, for this letter only.
 */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const token = await verifyToken<{ kind: string; letterId: string; by: string }>(req.headers.get("x-gateway-token"), gatewaySecret());
  if (!token || token.kind !== "gateway-resend" || token.letterId !== params.id) throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  return json({ sent: await resendLetter(params.id, token.by) });
});
