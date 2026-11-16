import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { BRAND, POWERED_BY } from "@/lib/brand";
import { LANGUAGE_NAMES } from "@/lib/intake/language";
import { fontPath } from "./guarantee-pdf";

// ---------------------------------------------------------------------------
// A received document's English translation as a PDF, for the case file or
// a medical adviser: what it is a translation of, from which language, by
// whom, and the translation itself. Liberation Sans is embedded so Turkish
// and French letters render. It says plainly that it is a machine
// translation for handling the case, not a certified translation.
// ---------------------------------------------------------------------------

export interface TranslationContent {
  filename: string;
  /** ISO 639-1 code of the original. */
  language: string | null;
  ocr: boolean;
  receivedOn: Date;
  text: string;
  caseRef?: string | null;
}

export function renderTranslationPdf(c: TranslationContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, bufferPages: true, info: { Title: `English translation — ${c.filename}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (b: Buffer) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const regular = fontPath("LiberationSans-Regular.ttf");
    const bold = fontPath("LiberationSans-Bold.ttf");
    if (regular) doc.registerFont("body", regular);
    if (bold) doc.registerFont("bold", bold);
    const R = regular ? "body" : "Helvetica";
    const B = bold ? "bold" : "Helvetica-Bold";
    const W = doc.page.width - 112;

    const logo = path.join(process.cwd(), "public", "brand", "caretrail-logo.png");
    if (fs.existsSync(logo)) doc.image(logo, 56, 44, { width: 150 });
    doc.font(R).fontSize(8.5).fillColor("#64748b").text(`${BRAND.name} · ${POWERED_BY}`, 56, 50, { width: W, align: "right" });

    const from = c.language ? (LANGUAGE_NAMES[c.language] ?? c.language.toUpperCase()) : "the original language";
    doc.moveDown(3);
    doc.font(B).fontSize(18).fillColor("#0f172a").text("English translation", 56, 104);
    doc.font(R).fontSize(10).fillColor("#334155");
    doc.moveDown(0.4);
    const rows: [string, string][] = [
      ["Original document", c.filename],
      ["Original language", `${from}${c.ocr ? " (scanned, read with OCR)" : ""}`],
      ["Received", c.receivedOn.toISOString().slice(0, 10)],
      ...(c.caseRef ? ([["Case", c.caseRef]] as [string, string][]) : []),
      ["Translated by", `${BRAND.name} AI`],
    ];
    for (const [label, value] of rows) {
      const y = doc.y;
      doc.font(B).text(label, 56, y, { width: 120 });
      doc.font(R).text(value, 180, y, { width: W - 124 });
      doc.moveDown(0.2);
    }
    doc.moveDown(0.6);
    doc.rect(56, doc.y, W, 34).fill("#f1f5f9");
    doc
      .font(R)
      .fontSize(8.5)
      .fillColor("#475569")
      .text(
        "Machine translation for handling the case. Names, dates, amounts and reference numbers are kept as written. Where a document is needed for legal purposes, a certified translation can be ordered.",
        64,
        doc.y + 6,
        { width: W - 16 }
      );
    doc.moveDown(1.4);
    doc.moveTo(56, doc.y).lineTo(56 + W, doc.y).strokeColor("#cbd5e1").lineWidth(0.8).stroke();
    doc.moveDown(0.8);

    doc.font(R).fontSize(10.5).fillColor("#0f172a").text(c.text.replace(/\r\n/g, "\n"), 56, doc.y, { width: W, lineGap: 2.5 });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // The footer sits in the bottom margin; without this pdfkit would start a new page for it.
      doc.page.margins.bottom = 0;
      doc
        .font(R)
        .fontSize(8)
        .fillColor("#94a3b8")
        .text(`${BRAND.name} · English translation of ${c.filename} · page ${i + 1} of ${range.count}`, 56, doc.page.height - 40, { width: W, align: "center", lineBreak: false });
    }
    doc.end();
  });
}

/** "medical-report.pdf" → "medical-report-english.pdf". */
export function translationFilename(filename: string): string {
  return `${filename.replace(/\.[a-z0-9]+$/i, "")}-english.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");
}
