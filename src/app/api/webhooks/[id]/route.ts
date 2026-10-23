import { json, withErrorHandling } from "@/lib/api";
import { deleteEndpoint } from "@/lib/services/webhooks";

export const dynamic = "force-dynamic";

export const DELETE = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  await deleteEndpoint(params.id);
  return json({ deleted: true });
});
