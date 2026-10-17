import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { resendLetter } from "@/lib/services/guarantee-letter";

export const dynamic = "force-dynamic";

/** Sends an already-sent letter to the hospital again (fax or e-mail on file). */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  return json({ sent: await resendLetter(params.id, (await getOperator(req)) ?? "operator") });
});
