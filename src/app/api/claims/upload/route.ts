import fs from "node:fs/promises";
import path from "node:path";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { badRequest, notFound } from "@/lib/errors";
import { nextClaimRef } from "@/lib/refs";
import { processDocument } from "@/lib/services/document-extraction";
import { reviewClaim } from "@/lib/services/claims";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["application/pdf", "text/plain"]);

/**
 * Claims intake: accepts multipart form data with one or more "files" plus a
 * "patientId", creates a claim, classifies and extracts every document, runs
 * the completeness check and returns the claim ready for human review.
 */
export const POST = withErrorHandling(async (req: Request) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Expected a multipart form upload.");
  }

  const patientId = String(form.get("patientId") ?? "");
  if (!patientId) throw badRequest("Please select the patient this claim belongs to.");
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw notFound("Patient");

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    throw badRequest("Please add at least one claim document.");
  }
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      throw badRequest(`"${file.name}": only PDF and plain-text documents are accepted.`);
    }
    if (file.size > env.maxUploadBytes) {
      throw badRequest(`"${file.name}" is too large (max ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB).`);
    }
  }

  const claim = await prisma.claim.create({
    data: {
      ref: await nextClaimRef(),
      status: "PROCESSING",
      patientId,
      history: [{ at: new Date().toISOString(), action: "Claim created from document upload", note: null }],
    },
  });

  const uploadDir = path.resolve(env.uploadDir);
  await fs.mkdir(uploadDir, { recursive: true });

  const processingErrors: string[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await fs.writeFile(path.join(uploadDir, safeName), buffer);
    const doc = await prisma.document.create({
      data: {
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        status: "UPLOADED",
        storagePath: `uploads/${safeName}`,
        claimId: claim.id,
        patientId,
      },
    });
    try {
      await processDocument(doc.id, buffer);
    } catch (err) {
      processingErrors.push(
        `"${file.name}" could not be processed${err instanceof Error ? `: ${err.message}` : "."}`
      );
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
