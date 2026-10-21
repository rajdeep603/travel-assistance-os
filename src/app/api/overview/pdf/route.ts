import { cookies } from "next/headers";
import { withErrorHandling } from "@/lib/api";
import { getOverview, overviewDays } from "@/lib/services/overview";
import { overviewPdfName, renderOverviewPdf } from "@/lib/services/overview-pdf";
import { zonedToday } from "@/lib/time";
import { OPERATION_TIME_ZONE, TIME_ZONE_COOKIE, isTimeZone } from "@/lib/time-zone";

export const dynamic = "force-dynamic";

/** The overview as a one-page PDF: ?days=7|30|90, times in the viewer's display zone. */
export const GET = withErrorHandling(async (req: Request) => {
  const days = overviewDays(new URL(req.url).searchParams.get("days"));
  const saved = cookies().get(TIME_ZONE_COOKIE)?.value;
  const timeZone = isTimeZone(saved) ? saved : OPERATION_TIME_ZONE;
  const overview = await getOverview({ days });
  const pdf = await renderOverviewPdf(overview, { timeZone });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${overviewPdfName(days, zonedToday())}"`,
      "cache-control": "no-store",
    },
  });
});
