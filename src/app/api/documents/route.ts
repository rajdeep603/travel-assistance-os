import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { processDocument } from "@/lib/services/document-extraction";
import { processingErrorMessage, readUpload, storeUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    // Full text stays on the detail endpoint; the list only needs metadata.
    omit: { textContent: true },
    include: { extraction: true, patient: true, case: { select: { id: true, ref: true } } },
  });
  return json({ documents: serialize(documents) });
});

/**
 * Upload a medical document (multipart form, field "file") and run the full
 * processing pipeline. Returns the processed document with its extraction.
 */
export const POST = withErrorHandling(async (req: Request) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Expected a multipart form upload with a \"file\" field.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw badRequest("Please choose a PDF document to upload.");
  }
  const caseId = String(form.get("caseId") ?? "") || null;
  const kase = caseId
    ? await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, patientId: true } })
    : null;
  if (caseId && !kase) throw notFound("Case");

  const { buffer, mimeType } = await readUpload(file);
  const storagePath = await storeUpload(file.name, buffer);

  const doc = await prisma.document.create({
    data: {
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
      status: "UPLOADED",
      storagePath,
      caseId: kase?.id ?? null,
      patientId: kase?.patientId ?? null,
    },
  });

  try {
    const processed = await processDocument(doc.id, buffer);
    return json({ document: serialize(processed) }, { status: 201 });
  } catch (err) {
    const failed = await prisma.document.findUnique({
      where: { id: doc.id },
      include: { extraction: true },
    });
    return json(
      {
        document: serialize(failed),
        error: { code: "PROCESSING_FAILED", message: processingErrorMessage(err) },
      },
      { status: 422 }
    );
  }
});
