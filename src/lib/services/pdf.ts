import { PDFParse } from "pdf-parse";

/**
 * DocumentTextService: extracts a text layer from an uploaded document.
 * PDFs are parsed with pdf-parse (pdf.js). Plain text files pass through.
 * A real OCR engine for scanned documents would slot in behind this same
 * function; for the demo, documents without a text layer fail gracefully.
 */
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === "text/plain") {
    return buffer.toString("utf-8");
  }
  if (mimeType === "application/pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text ?? "";
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
  throw new Error(`Unsupported document type: ${mimeType}`);
}
