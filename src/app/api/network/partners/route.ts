import { json, serialize, withErrorHandling } from "@/lib/api";
import { HANDOFF_SCOPES, partnersFor } from "@/lib/services/network";

export const dynamic = "force-dynamic";

/** Partners that can take a case, those covering the country first. */
export const GET = withErrorHandling(async (req: Request) => {
  const country = new URL(req.url).searchParams.get("country");
  return json({ partners: serialize(await partnersFor(country)), scopes: HANDOFF_SCOPES });
});
