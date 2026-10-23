import { json, withErrorHandling } from "@/lib/api";
import { caseView } from "@/lib/api-v1/views";
import { requireApiCaller } from "@/lib/auth/api-keys";

export const dynamic = "force-dynamic";

/** GET /api/v1/cases/{ref}: the case, its guarantees, claims and latest events. */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { ref: string } }) => {
  await requireApiCaller(req);
  return json({ case: await caseView(params.ref) });
});
