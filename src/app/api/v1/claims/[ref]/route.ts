import { json, withErrorHandling } from "@/lib/api";
import { claimView } from "@/lib/api-v1/views";
import { requireApiCaller } from "@/lib/auth/api-keys";

export const dynamic = "force-dynamic";

/** GET /api/v1/claims/{ref}: a claim's status, what's missing and its settlement. */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { ref: string } }) => {
  await requireApiCaller(req);
  return json({ claim: await claimView(params.ref) });
});
