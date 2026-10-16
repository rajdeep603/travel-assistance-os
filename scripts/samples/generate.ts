import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SAMPLE_KITS } from "../../src/lib/samples/catalog";
import { INTAKE_REQUESTS } from "../../src/lib/samples/intake-requests";
import { EMAIL_SAMPLES } from "../../src/lib/intake/samples";
import { SAMPLE_DOCS } from "./documents";
import { buildEml } from "./eml";
import { loadRaster } from "./raster";
import { liberationFonts, renderPdf } from "./render";

// Generates the fictional sample library into public/:
//   demo-documents/, demo-inbound/  real-looking PDFs and fax scans
//   samples/inbox/                  .eml e-mails with their attachments
//   samples/intake/                 assistance requests as text
// and the offline OCR ground truth for the scans (src/lib/intake/scan-text.json).
//
//   npm run demo:samples      everything (needs macOS for the handwriting font)
//   npm run demo:pdfs         only the text PDFs (what CI regenerates)

const PUBLIC = path.join(process.cwd(), "public");
const SCAN_TEXT = path.join(process.cwd(), "src", "lib", "intake", "scan-text.json");
const onlyPdfs = process.argv.includes("--pdfs");

const write = (rel: string, data: Buffer | string) => {
  const file = path.join(PUBLIC, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log(`  ${rel}`);
};

/** pdf-parse text without its page markers, as the offline OCR returns it. */
async function pdfText(pdf: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  const { text } = await parser.getText();
  await parser.destroy();
  return text.replace(/\n*-- \d+ of \d+ --\n*/g, "\n").trim();
}

async function main() {
  const fonts = liberationFonts();
  const raster = await loadRaster(fonts);
  if (!raster) console.warn("! @napi-rs/canvas unavailable: stamps are skipped and faxes cannot be drawn.");
  const stamp = raster ? raster.stamp : () => null;

  const scans: Record<string, { sha256: string; text: string }> = {};
  console.log("Documents");
  for (const d of SAMPLE_DOCS) {
    const rel = `${d.dir}/${d.file}`;
    if (!d.fax) {
      const { pdf } = await renderPdf(d, fonts, { stamp });
      write(rel, pdf);
      continue;
    }
    if (onlyPdfs) continue;
    if (!raster) throw new Error(`Cannot draw the fax ${d.file} without @napi-rs/canvas.`);
    if (d.fax.handwritten && !raster.hasHandwriting) console.warn(`! no handwriting font: ${d.file} uses an oblique sans instead`);
    // The OCR ground truth is the page as written, hand-filled values included.
    const written = await renderPdf(d, fonts, { stamp, hand: "text" });
    const header = `${d.fax.sentAt} FROM: ${d.fax.from} ${d.fax.station} TO: ${d.fax.to} P.001/001`;
    const blank = await renderPdf(d, fonts, { stamp, hand: "omit" });
    const fax = await raster.fax(blank.pdf, d, blank.hand);
    write(rel, fax);
    scans[d.file] = {
      sha256: createHash("sha256").update(fax).digest("hex"),
      text: `${header}\n${await pdfText(written.pdf)}`,
    };
  }
  if (onlyPdfs) return;

  console.log("E-mails");
  for (const kit of SAMPLE_KITS) {
    for (const f of kit.files) {
      if (!f.email) continue;
      const s = EMAIL_SAMPLES.find((e) => e.id === f.email!.sample);
      if (!s) throw new Error(`No EMAIL_SAMPLES entry "${f.email.sample}"`);
      const eml = buildEml({
        from: s.from,
        to: s.to,
        subject: s.subject,
        body: s.body,
        sentAt: f.email.sentAt,
        attachments: s.attachments.map((p) => ({
          filename: path.basename(p),
          content: fs.readFileSync(path.join(PUBLIC, p)),
          type: "application/pdf",
        })),
      });
      write(f.path, eml);
    }
  }

  console.log("Assistance requests");
  for (const r of INTAKE_REQUESTS) write(`samples/intake/${r.file}`, r.text);

  fs.writeFileSync(SCAN_TEXT, `${JSON.stringify(scans, null, 2)}\n`);
  console.log(`OCR ground truth for ${Object.keys(scans).length} scans: ${path.relative(process.cwd(), SCAN_TEXT)}`);

  const missing = SAMPLE_KITS.flatMap((k) => k.files.map((f) => f.path)).filter((p) => !fs.existsSync(path.join(PUBLIC, p)));
  if (missing.length) throw new Error(`Catalog files not generated: ${missing.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
