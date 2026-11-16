import { withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { renderTranslationPdf, translationFilename } from "@/lib/services/translation-pdf";

export const dynamic = "force-dynamic";

/** A document's English translation as a PDF (only documents that were translated have one). */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  const doc = await prisma.document.findUnique({ where: { id: params.id }, include: { case: { select: { ref: true } } } });
  if (!doc?.translatedText) throw notFound("Translation");
  const pdf = await renderTranslationPdf({
    filename: doc.filename,
    language: doc.language,
    ocr: doc.ocr,
    receivedOn: doc.createdAt,
    text: doc.translatedText,
    caseRef: doc.case?.ref ?? null,
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${translationFilename(doc.filename)}"`,
      "cache-control": "private, max-age=60",
    },
  });
});
