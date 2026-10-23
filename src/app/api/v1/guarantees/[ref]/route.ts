import { json, withErrorHandling } from "@/lib/api";
import { guaranteeView } from "@/lib/api-v1/views";
import { requireApiCaller } from "@/lib/auth/api-keys";

export const dynamic = "force-dynamic";

/** GET /api/v1/guarantees/{ref}: a Letter of Guarantee's status and amounts. */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { ref: string } }) => {
  await requireApiCaller(req);
  return json({ guarantee: await guaranteeView(params.ref) });
});
