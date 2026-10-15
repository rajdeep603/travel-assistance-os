import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { processDocument } from "@/lib/services/document-extraction";
import { reviewClaim } from "@/lib/services/claims";
import { processingErrorMessage } from "@/lib/uploads";

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

const bodySchema = z.object({ caseId: z.string().optional() });

export const POST = withErrorHandling(async (req: Request) => {
  const { caseId } = bodySchema.parse(await req.json().catch(() => ({})));
  // Filed on a case when opened from one; otherwise on the sample patient.
  const kase = caseId
    ? await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, patientId: true } })
    : null;
  if (caseId && !kase) throw notFound("Case");
  const patient = kase
    ? await prisma.patient.findUnique({ where: { id: kase.patientId } })
    : await prisma.patient.findUnique({ where: { ref: SAMPLE_PACK.patientRef } });
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

  const claim = await withRef("claim", (ref) =>
    prisma.claim.create({
      data: {
        ref,
        status: "PROCESSING",
        patientId: patient.id,
        caseId: kase?.id ?? null,
        history: [
          {
            at: new Date().toISOString(),
            action: "Claim created from the fictional sample pack",
            note: null,
          },
        ],
      },
    })
  );

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
        caseId: kase?.id ?? null,
        patientId: patient.id,
      },
    });
    try {
      await processDocument(doc.id, buffer);
    } catch (err) {
      warnings.push(`"${name}": ${processingErrorMessage(err)}`);
    }
  }

  const reviewed = await reviewClaim(claim.id);
  return json({ claim: serialize(reviewed), warnings }, { status: 201 });
});
