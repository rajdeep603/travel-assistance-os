import { withErrorHandling } from "@/lib/api";
import { leadsCsv, listLeads } from "@/lib/services/leads";
import { zonedToday } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Every lead as a CSV file, for the CRM after the show. */
export const GET = withErrorHandling(async () => {
  const csv = leadsCsv(await listLeads());
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="caretrail-leads-${zonedToday()}.csv"`,
      "cache-control": "no-store",
    },
  });
});
