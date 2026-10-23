import { json, serialize, withErrorHandling } from "@/lib/api";
import { vendorOversight } from "@/lib/services/network";

export const dynamic = "force-dynamic";

/** For insurers: the assistance companies handling their travellers, scored side by side. */
export const GET = withErrorHandling(async () => {
  return json({ vendors: serialize(await vendorOversight()) });
});
