import { json, serialize, withErrorHandling } from "@/lib/api";
import { pingEndpoint } from "@/lib/services/webhooks";

export const dynamic = "force-dynamic";

/** Sends a signed test event to the endpoint. */
export const POST = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  return json({ delivery: serialize(await pingEndpoint(params.id)) });
});
