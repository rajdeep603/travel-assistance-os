import { json, serialize, withErrorHandling } from "@/lib/api";
import { receivablesOverview } from "@/lib/services/receivables";

export const dynamic = "force-dynamic";

/** Invoices to foreign payers: balances by age and payer, and every invoice. */
export const GET = withErrorHandling(async (req: Request) => {
  const facility = new URL(req.url).searchParams.get("facility");
  return json(serialize(await receivablesOverview({ facility })));
});
