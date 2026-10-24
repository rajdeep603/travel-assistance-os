import { json, withErrorHandling } from "@/lib/api";
import { getDecisions, overviewDays } from "@/lib/services/overview";

export const dynamic = "force-dynamic";

/** What is waiting for a person (the header's bell): ?days=7|30|90, as on the overview. */
export const GET = withErrorHandling(async (req: Request) => {
  const days = overviewDays(new URL(req.url).searchParams.get("days"));
  const decisions = await getDecisions({ days });
  return json({ decisions: decisions.filter((d) => d.count > 0) });
});
