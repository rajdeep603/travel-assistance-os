import { withErrorHandling } from "@/lib/api";
import { leadPdf } from "@/lib/services/leads";

export const dynamic = "force-dynamic";

/** The lead's quotation PDF, with the number and date it was submitted under. */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  const { pdf, filename } = await leadPdf(params.id);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});
