import { json, serialize, withErrorHandling } from "@/lib/api";
import { providerDetail } from "@/lib/services/provider-validation";

export const dynamic = "force-dynamic";

/** One provider: the record, prices, links, change log, feedback and the validation calls about it. */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { ref: string } }) => {
  return json(serialize({ provider: await providerDetail(params.ref) }));
});
