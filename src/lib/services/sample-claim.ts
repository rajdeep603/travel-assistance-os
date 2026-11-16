import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { processingErrorMessage } from "@/lib/uploads";
import { reviewClaim, type ClaimWithRelations } from "./claims";
import { processDocument } from "./document-extraction";

/** The bundled fictional claim pack: medical report, invoice and discharge summary. */
export const SAMPLE_CLAIM_PACK = {
  patientRef: "PAT-1001",
  files: ["medical-report-aylin-yilmaz.pdf", "hospital-invoice-aylin-yilmaz.pdf", "discharge-summary-aylin-yilmaz.pdf"],
};

/**
 * Opens a claim from the sample pack, reads every document and reviews the
 * claim, as the upload route does with real files. Filed on `caseId` when
 * given (on its patient), else on the pack's sample patient.
 */
export async function createSampleClaim(opts: { caseId?: string | null; note?: string } = {}): Promise<{ claim: ClaimWithRelations; warnings: string[] }> {
  const kase = opts.caseId ? await prisma.case.findUnique({ where: { id: opts.caseId }, select: { id: true, patientId: true } }) : null;
  if (opts.caseId && !kase) throw notFound("Case");
  const patient = kase
    ? await prisma.patient.findUnique({ where: { id: kase.patientId } })
    : await prisma.patient.findUnique({ where: { ref: SAMPLE_CLAIM_PACK.patientRef } });
  if (!patient) throw notFound("Sample patient");

  const dir = path.join(process.cwd(), "public", "demo-documents");
  const buffers: { name: string; buffer: Buffer }[] = [];
  for (const name of SAMPLE_CLAIM_PACK.files) {
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
        history: [{ at: new Date().toISOString(), action: opts.note ?? "Claim created from the fictional sample pack", note: null }],
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
  return { claim: await reviewClaim(claim.id), warnings };
}
