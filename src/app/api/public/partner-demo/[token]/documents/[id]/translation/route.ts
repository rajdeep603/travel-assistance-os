import { withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { portalOwnsDocument } from "@/lib/partner-demo/modules";
import { logPortalEventOnce, requireViewer } from "@/lib/partner-demo/portal";
import { renderTranslationPdf, translationFilename } from "@/lib/services/translation-pdf";

export const dynamic = "force-dynamic";

/** The English translation of a document from this portal's own runs, as a PDF. */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { token: string; id: string } }) => {
  const { portal, viewer } = await requireViewer(req, params.token);
  const doc = await prisma.document.findUnique({ where: { id: params.id }, include: { case: { select: { ref: true } } } });
  if (!doc?.translatedText || !(await portalOwnsDocument(portal.id, doc))) throw notFound("Translation");
  const pdf = await renderTranslationPdf({
    filename: doc.filename,
    language: doc.language,
    ocr: doc.ocr,
    receivedOn: doc.createdAt,
    text: doc.translatedText,
    caseRef: doc.case?.ref ?? null,
  });
  await logPortalEventOnce(portal.id, "DOCUMENT", viewer.email, { value: "TRANSLATION" }, 20);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${translationFilename(doc.filename)}"`,
      "cache-control": "private, max-age=60",
    },
  });
});
