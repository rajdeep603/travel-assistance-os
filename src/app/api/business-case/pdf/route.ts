import { withErrorHandling } from "@/lib/api";
import { BusinessCaseInputSchema, businessCasePdf } from "@/lib/services/business-case-report";

export const dynamic = "force-dynamic";

/** The business case as a PDF, from the numbers on the page. */
export const POST = withErrorHandling(async (req: Request) => {
  const input = BusinessCaseInputSchema.parse(await req.json().catch(() => ({})));
  const { pdf, filename } = await businessCasePdf(input);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});
