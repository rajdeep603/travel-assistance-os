import { json, serialize, withErrorHandling } from "@/lib/api";
import { healthReport } from "@/lib/services/provider-health";

export const dynamic = "force-dynamic";

/** Network health: the score, what is wrong and how often, and the records worth fixing first. */
export const GET = withErrorHandling(async () => {
  return json(serialize(await healthReport()));
});
