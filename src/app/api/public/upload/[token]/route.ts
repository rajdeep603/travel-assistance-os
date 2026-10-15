import { json, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError, badRequest } from "@/lib/errors";
import { reviewClaim } from "@/lib/services/claims";
import { processDocument } from "@/lib/services/document-extraction";
import { verifyUploadToken } from "@/lib/upload-links";
import { processingErrorMessage, readUpload, storeUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const MAX_FILES = 6;

async function claimFor(token: string) {
  const ticket = await verifyUploadToken(token);
  if (!ticket) throw new ApiError("This upload link is invalid or has expired. Please call the assistance line for a new one.", 404, "LINK_EXPIRED");
  const claim = await prisma.claim.findUnique({ where: { id: ticket.claimId }, include: { patient: true } });
  if (!claim) throw new ApiError("This claim no longer exists.", 404, "NOT_FOUND");
  return claim;
}

function publicView(claim: { ref: string; status: string; issues: unknown; patient: { firstName: string } }) {
  const issues = (Array.isArray(claim.issues) ? claim.issues : []) as { severity?: string; message?: string }[];
  return {
    ref: claim.ref,
    status: claim.status,
    firstName: claim.patient.firstName,
    missing: issues.filter((i) => i.severity === "error").map((i) => i.message),
  };
}

/** Claimant view of the claim behind a signed link: status and what's missing. */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { token: string } }) => {
  return json({ claim: publicView(await claimFor(params.token)) });
});

/** Claimant uploads documents; they're processed and the claim is re-reviewed. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const claim = await claimFor(params.token);
  if (["APPROVED", "PAID", "REJECTED"].includes(claim.status)) {
    throw badRequest("This claim has already been decided; no more documents are needed.");
  }
  const form = await req.formData().catch(() => {
    throw badRequest("Expected a multipart upload.");
  });
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw badRequest("Please choose at least one document.");
  if (files.length > MAX_FILES) throw badRequest(`Please upload at most ${MAX_FILES} documents at a time.`);
  const uploads = [];
  for (const file of files) uploads.push({ file, ...(await readUpload(file)) });

  const warnings: string[] = [];
  for (const { file, buffer, mimeType } of uploads) {
    const doc = await prisma.document.create({
      data: {
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
        status: "UPLOADED",
        storagePath: await storeUpload(file.name, buffer),
        claimId: claim.id,
        caseId: claim.caseId,
        patientId: claim.patientId,
      },
    });
    try {
      await processDocument(doc.id, buffer);
    } catch (err) {
      warnings.push(`"${file.name}": ${processingErrorMessage(err)}`);
    }
  }
  const reviewed = await reviewClaim(claim.id);
  if (claim.caseId) {
    await prisma.caseEvent.create({
      data: {
        caseId: claim.caseId,
        type: "CLAIM",
        title: `Claimant uploaded ${files.length} document(s) to ${claim.ref} via secure link`,
        body: files.map((f) => f.name).join(", "),
        actor: "claimant",
      },
    });
  }
  return json({ claim: publicView({ ...reviewed, patient: claim.patient }), warnings });
});
