import type { Document, DocumentExtraction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { detectLanguage } from "@/lib/intake/language";
import { processingErrorMessage } from "@/lib/uploads";
import { isSampleFile } from "@/lib/samples/fingerprints";
import { getAIService, runAI, withOfflineAI } from "./ai";
import { extractTextFromFile } from "./pdf";
import type { MedicalExtractionResult } from "./types";

/** pdf.js emits page markers even for image-only pages; a real text layer has words. */
export function hasReadableText(text: string): boolean {
  const letters = text.replace(/--\s*\d+\s+of\s+\d+\s*--/g, "").replace(/[^\p{L}]/gu, "");
  return letters.length >= 20;
}

/**
 * DocumentExtractionService: runs the full pipeline for one document —
 * text layer (or OCR for scans and faxes) → language detection → AI
 * classification + structured extraction (+ English translation when the
 * original isn't English) → persisted extraction record.
 */
export async function processDocument(
  documentId: string,
  buffer: Buffer
): Promise<Document & { extraction: DocumentExtraction | null }> {
  // The demo's own samples stay on the offline rules, so rehearsed figures hold.
  return (await isSampleFile(buffer)) ? withOfflineAI(() => runPipeline(documentId, buffer)) : runPipeline(documentId, buffer);
}

async function runPipeline(
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
    let text = await extractTextFromFile(buffer, doc.mimeType);
    let ocr = false;
    if (!hasReadableText(text)) {
      // Scanned, faxed or handwritten: no text layer, so read the image.
      const read = await runAI("readDocument", (ai) =>
        ai.readDocument({ buffer, mimeType: doc.mimeType, filename: doc.filename })
      );
      text = read.value.text;
      ocr = true;
    }
    if (!hasReadableText(text)) {
      throw new ApiError("No readable text was found in the document.", 422, "UNREADABLE_DOCUMENT");
    }
    const language = detectLanguage(text);

    const ai = getAIService();
    const [kind, result, translatedText] = await Promise.all([
      ai.classifyDocument(text, doc.filename),
      ai.extractMedicalDocument(text),
      language === "en" ? Promise.resolve(null) : ai.translateText(text, "English"),
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
      data: {
        status: "PROCESSED",
        kind,
        textContent: text.slice(0, 20000),
        ocr,
        language,
        translatedText: translatedText?.slice(0, 20000) ?? null,
      },
      include: { extraction: true },
    });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error(`[documents] processing ${documentId} failed:`, err);
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "FAILED", error: processingErrorMessage(err) },
    });
    throw err;
  }
}

export function toExtractionRow(result: MedicalExtractionResult) {
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
    documentNumber: result.documentNumber ?? null,
    lineItems: result.lineItems?.length ? JSON.parse(JSON.stringify(result.lineItems)) : undefined,
    summary: result.summary,
    missingInfo: result.missingInfo ?? [],
    confidence: result.confidence,
    aiSource: result.source ?? null,
    raw: JSON.parse(JSON.stringify(result)),
  };
}
