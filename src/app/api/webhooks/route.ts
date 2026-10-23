import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { apiKeyCount } from "@/lib/auth/api-keys";
import { getOperator } from "@/lib/auth/session";
import { WEBHOOK_EVENTS, createEndpoint, listEndpoints } from "@/lib/services/webhooks";

export const dynamic = "force-dynamic";

/** The webhook endpoints, their recent deliveries, the events on offer and whether API keys are set up. */
export const GET = withErrorHandling(async () => {
  return json({ endpoints: serialize(await listEndpoints()), events: WEBHOOK_EVENTS, apiKeys: apiKeyCount() });
});

const Body = z.object({ url: z.string().trim().min(8).max(500), events: z.array(z.string()).min(1), description: z.string().trim().max(120).optional() });

/** Adds an endpoint; its signing secret is returned in full this once. */
export const POST = withErrorHandling(async (req: Request) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  const endpoint = await createEndpoint(body, (await getOperator(req)) ?? "operator");
  return json({ endpoint: serialize(endpoint) }, { status: 201 });
});
