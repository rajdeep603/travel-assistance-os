import fs from "node:fs/promises";
import path from "node:path";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { nextClaimRef } from "@/lib/refs";
import { processDocument } from "@/lib/services/document-extraction";
import { reviewClaim } from "@/lib/services/claims";

export const dynamic = "force-dynamic";

/**
 * One-click booth flow: creates a claim from the bundled fictional sample
 * pack (medical report + invoice + discharge summary) without a file picker,
 * mirroring the multipart upload route.
 */
const SAMPLE_PACK = {
  patientRef: "PAT-1001",
  files: [
    "medical-report-aylin-yilmaz.pdf",
    "hospital-invoice-aylin-yilmaz.pdf",
    "discharge-summary-aylin-yilmaz.pdf",
  ],
};

export const POST = withErrorHandling(async () => {
  const patient = await prisma.patient.findUnique({
    where: { ref: SAMPLE_PACK.patientRef },
  });
  if (!patient) throw notFound("Sample patient");

  const dir = path.join(process.cwd(), "public", "demo-documents");
  const buffers: { name: string; buffer: Buffer }[] = [];
  for (const name of SAMPLE_PACK.files) {
    try {
      buffers.push({ name, buffer: await fs.readFile(path.join(dir, name)) });
    } catch {
      throw notFound(`Sample document "${name}"`);
    }
  }

  const claim = await prisma.claim.create({
    data: {
      ref: await nextClaimRef(),
      status: "PROCESSING",
      patientId: patient.id,
      history: [
        {
          at: new Date().toISOString(),
          action: "Claim created from the fictional sample pack",
          note: null,
        },
      ],
    },
  });

  const warnings: string[] = [];
  for (const { name, buffer } of buffers) {
    const doc = await prisma.document.create({
      data: {
        filename: name,
        mimeType: "application/pdf",
        sizeBytes: buffer.length,
        status: "UPLOADED",
        storagePath: `demo-documents/${name}`,
        claimId: claim.id,
        patientId: patient.id,
      },
    });
    try {
      await processDocument(doc.id, buffer);
    } catch (err) {
      warnings.push(
        `"${name}" could not be processed${err instanceof Error ? `: ${err.message}` : "."}`
      );
    }
  }

  const reviewed = await reviewClaim(claim.id);
  return json({ claim: serialize(reviewed), warnings }, { status: 201 });
});
