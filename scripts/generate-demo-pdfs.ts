import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { DEMO_DOCUMENTS } from "./demo-documents";

// Generates the fictional demo medical PDFs into public/demo-documents/.
// Idempotent: existing files are overwritten with identical content.

const OUT_DIR = path.join(process.cwd(), "public", "demo-documents");

async function generateOne(def: (typeof DEMO_DOCUMENTS)[number]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const out = fs.createWriteStream(path.join(OUT_DIR, def.file));
    doc.pipe(out);

    doc.font("Helvetica-Bold").fontSize(14).text(def.title);
    doc.moveDown(0.5);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#666666")
      .text("Generated for the ITIC Global demonstration. Entirely fictional.");
    doc.moveDown();
    doc.fillColor("#000000").fontSize(11);
    for (const line of def.lines) {
      if (line === "") doc.moveDown(0.6);
      else doc.text(line);
    }
    doc.end();
    out.on("finish", () => resolve());
    out.on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const def of DEMO_DOCUMENTS) {
    await generateOne(def);
    console.log(`generated ${def.file}`);
  }
  console.log(`\n${DEMO_DOCUMENTS.length} fictional demo PDFs written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
