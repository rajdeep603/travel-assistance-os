import { json, serialize, withErrorHandling } from "@/lib/api";
import { networkOverview } from "@/lib/services/provider-network";

export const dynamic = "force-dynamic";

/** The provider network's quality: likely duplicates, accreditations, rates and recent merges. */
export const GET = withErrorHandling(async () => {
  return json(serialize(await networkOverview()));
});
