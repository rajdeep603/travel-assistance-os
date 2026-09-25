import type { Document, DocumentExtraction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAIService } from "./ai";
import { extractTextFromFile } from "./pdf";

/**
 * DocumentExtractionService: runs the full pipeline for one document —
 * text extraction → AI classification → AI structured extraction →
 * validation → persisted extraction record.
 */
export async function processDocument(
  documentId: string,
  buffer: Buffer
): Promise<Document & { extraction: DocumentExtraction | null }> {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Document not found");

  await prisma.document.update({
    where: { id: documentId },
    data: { status: "PROCESSING", error: null },
  });

  try {
    const text = await extractTextFromFile(buffer, doc.mimeType);
    if (!text.trim()) {
      throw new Error(
        "No readable text found in the document. Scanned documents need OCR, which is not enabled in this demo."
      );
    }

    const ai = getAIService();
    const [kind, result] = await Promise.all([
      ai.classifyDocument(text, doc.filename),
      ai.extractMedicalDocument(text),
    ]);

    await prisma.documentExtraction.upsert({
      where: { documentId },
      create: {
        documentId,
        ...toExtractionRow(result),
      },
      update: toExtractionRow(result),
    });

    return prisma.document.update({
      where: { id: documentId },
      data: { status: "PROCESSED", kind, textContent: text.slice(0, 20000) },
      include: { extraction: true },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Document processing failed.";
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "FAILED", error: message },
    });
    throw err;
  }
}

function toExtractionRow(result: {
  extraction: {
    patientName: string | null;
    dateOfBirth: string | null;
    hospital: string | null;
    doctor: string | null;
    diagnosis: string | null;
    symptoms: string[];
    admissionDate: string | null;
    dischargeDate: string | null;
    procedures: string[];
    medications: string[];
    invoiceAmount: number | null;
    currency: string | null;
    policyReference: string | null;
  };
  summary: string;
  missingInfo: string[];
  confidence: number;
}) {
  const e = result.extraction;
  return {
    patientName: e.patientName,
    dateOfBirth: e.dateOfBirth,
    hospital: e.hospital,
    doctor: e.doctor,
    diagnosis: e.diagnosis,
    symptoms: e.symptoms ?? [],
    admissionDate: e.admissionDate,
    dischargeDate: e.dischargeDate,
    procedures: e.procedures ?? [],
    medications: e.medications ?? [],
    invoiceAmount: e.invoiceAmount,
    currency: e.currency,
    policyReference: e.policyReference,
    summary: result.summary,
    missingInfo: result.missingInfo ?? [],
    confidence: result.confidence,
    raw: JSON.parse(JSON.stringify(result)),
  };
}
