import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { processDocument } from "@/lib/services/document-extraction";
import { reviewClaim } from "@/lib/services/claims";
import { processingErrorMessage, readUpload, storeUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/** A claim pack is a handful of documents; more is almost certainly a mistake. */
const MAX_FILES = 8;

/**
 * Claims intake: accepts multipart form data with one or more "files" plus a
 * "patientId" (or a "caseId", whose patient is used), creates a claim, classifies and extracts every document, runs
 * the completeness check and returns the claim ready for human review.
 */
export const POST = withErrorHandling(async (req: Request) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Expected a multipart form upload.");
  }

  const caseId = String(form.get("caseId") ?? "") || null;
  const kase = caseId
    ? await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, patientId: true } })
    : null;
  if (caseId && !kase) throw notFound("Case");

  const patientId = kase?.patientId ?? String(form.get("patientId") ?? "");
  if (!patientId) throw badRequest("Please select the patient this claim belongs to.");
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw notFound("Patient");

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    throw badRequest("Please add at least one claim document.");
  }
  if (files.length > MAX_FILES) {
    throw badRequest(`Please upload at most ${MAX_FILES} documents per claim.`);
  }
  // Validate every file before creating anything.
  const uploads = [];
  for (const file of files) uploads.push({ file, ...(await readUpload(file)) });

  const claim = await withRef("claim", (ref) =>
    prisma.claim.create({
      data: {
        ref,
        status: "PROCESSING",
        patientId,
        caseId: kase?.id ?? null,
        history: [{ at: new Date().toISOString(), action: "Claim created from document upload", note: null }],
      },
    })
  );

  const processingErrors: string[] = [];
  for (const { file, buffer, mimeType } of uploads) {
    const doc = await prisma.document.create({
      data: {
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
        status: "UPLOADED",
        storagePath: await storeUpload(file.name, buffer),
        claimId: claim.id,
        caseId: kase?.id ?? null,
        patientId,
      },
    });
    try {
      await processDocument(doc.id, buffer);
    } catch (err) {
      processingErrors.push(`"${file.name}": ${processingErrorMessage(err)}`);
    }
  }

  const reviewed = await reviewClaim(claim.id);
  return json(
    {
      claim: serialize(reviewed),
      warnings: processingErrors,
    },
    { status: 201 }
  );
});
