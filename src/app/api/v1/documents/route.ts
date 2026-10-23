import { json, withErrorHandling } from "@/lib/api";
import { requireApiCaller } from "@/lib/auth/api-keys";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { reviewBills } from "@/lib/services/bill-review-service";
import { processDocument } from "@/lib/services/document-extraction";
import { readUpload, storeUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/documents (multipart: file, optional caseRef): reads a medical
 * document or invoice and returns what was extracted, plus the bill review
 * for an invoice.
 */
export const POST = withErrorHandling(async (req: Request) => {
  await requireApiCaller(req);
  const form = await req.formData().catch(() => {
    throw badRequest('Expected a multipart upload with a "file" field.');
  });
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw badRequest('Attach the document as "file".');
  const caseRef = String(form.get("caseRef") ?? "").trim();
  const kase = caseRef ? await prisma.case.findFirst({ where: { ref: caseRef.toUpperCase() }, select: { id: true, patientId: true } }) : null;
  if (caseRef && !kase) throw notFound("Case");
  const { buffer, mimeType } = await readUpload(file);
  const doc = await prisma.document.create({
    data: { filename: file.name, mimeType, sizeBytes: file.size, status: "UPLOADED", storagePath: await storeUpload(file.name, buffer), caseId: kase?.id ?? null, patientId: kase?.patientId ?? null },
  });
  await processDocument(doc.id, buffer);
  await reviewBills([doc.id]);
  const d = await prisma.document.findUniqueOrThrow({ where: { id: doc.id }, include: { extraction: true, billReview: true } });
  const e = d.extraction;
  return json(
    {
      document: {
        id: d.id,
        kind: d.kind,
        language: d.language,
        extraction: e
          ? {
              patientName: e.patientName,
              dateOfBirth: e.dateOfBirth,
              hospital: e.hospital,
              diagnosis: e.diagnosis,
              admissionDate: e.admissionDate,
              dischargeDate: e.dischargeDate,
              invoiceAmount: e.invoiceAmount == null ? null : Number(e.invoiceAmount),
              currency: e.currency,
              policyReference: e.policyReference,
              missingInfo: e.missingInfo,
              confidence: e.confidence,
            }
          : null,
        billReview: d.billReview
          ? { billed: Number(d.billReview.billed), recommended: Number(d.billReview.recommended), savings: Number(d.billReview.savings), currency: d.billReview.currency, ruleset: d.billReview.ruleset }
          : null,
      },
    },
    { status: 201 }
  );
});
