import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { INBOUND_PDFS, type InboundPdf } from "../src/lib/intake/samples";

// Generates the fictional inbound samples (hospital e-mail attachments and
// fax scans) into public/demo-inbound/. Text PDFs embed a Unicode font so
// Turkish letters survive; faxes are image-only pages (no text layer), so
// reading them needs OCR — exactly like real faxes. Run: npm run demo:inbound

const OUT_DIR = path.join(process.cwd(), "public", "demo-inbound");

const UNICODE_FONTS = [
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  "/Library/Fonts/Arial Unicode.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
];
const HANDWRITING_FONTS = [
  "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf",
  "/System/Library/Fonts/Noteworthy.ttc",
];

const firstExisting = (paths: string[]) => paths.find((p) => fs.existsSync(p)) ?? null;

function textPdf(def: InboundPdf, font: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const out = fs.createWriteStream(path.join(OUT_DIR, def.file));
    doc.pipe(out);
    if (font) doc.registerFont("body", font);
    const body = font ? "body" : "Helvetica";
    doc.font(body).fontSize(14).text(def.title);
    doc.moveDown();
    doc.fontSize(11);
    for (const line of def.lines) {
      if (line === "") doc.moveDown(0.6);
      else doc.text(line);
    }
    doc.end();
    out.on("finish", () => resolve());
    out.on("error", reject);
  });
}

/** Renders the page as a fax would deliver it: a slightly skewed, noisy image. */
function faxImage(def: InboundPdf, handwriting: string | null, plain: string | null): Buffer {
  const W = 1240;
  const H = 1754; // A4 at 150 dpi
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fbfbf8";
  ctx.fillRect(0, 0, W, H);

  // Fax transmission header.
  ctx.fillStyle = "#222";
  ctx.font = `20px ${plain ? "Plain" : "sans-serif"}`;
  ctx.fillText(`FROM: +90 212 000 2005   2026-10-15 09:42   P.1/1   FICTIONAL DEMO`, 60, 40);
  ctx.fillRect(60, 52, W - 120, 2);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate((0.7 * Math.PI) / 180); // the page went in a little crooked
  ctx.translate(-W / 2, -H / 2);
  const hand = def.handwritten && handwriting;
  ctx.font = hand ? "38px Hand" : `30px ${plain ? "Plain" : "sans-serif"}`;
  ctx.fillStyle = hand ? "#1b2a6b" : "#111";
  let y = 150;
  for (const line of def.lines) {
    if (line === "") {
      y += 30;
      continue;
    }
    ctx.fillText(line, 90 + (hand ? Math.sin(y) * 6 : 0), y);
    y += hand ? 66 : 52;
  }
  ctx.restore();

  // Scanner/fax speckle and banding.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  for (let i = 0; i < 2600; i++) ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 1.5, 1 + rand() * 1.5);
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  for (let b = 0; b < 6; b++) ctx.fillRect(0, rand() * H, W, 2 + rand() * 4);

  return canvas.toBuffer("image/png");
}

function scannedPdf(def: InboundPdf, handwriting: string | null, plain: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const out = fs.createWriteStream(path.join(OUT_DIR, def.file));
    doc.pipe(out);
    doc.image(faxImage(def, handwriting, plain), 0, 0, { width: doc.page.width, height: doc.page.height });
    doc.end();
    out.on("finish", () => resolve());
    out.on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const unicode = firstExisting(UNICODE_FONTS);
  const handwriting = firstExisting(HANDWRITING_FONTS);
  if (unicode) GlobalFonts.registerFromPath(unicode, "Plain");
  if (handwriting) GlobalFonts.registerFromPath(handwriting, "Hand");
  if (!unicode) console.warn("No Unicode TTF found: Turkish letters may not render in text PDFs.");
  for (const def of INBOUND_PDFS) {
    await (def.scanned ? scannedPdf(def, handwriting, unicode) : textPdf(def, unicode));
    console.log(`generated ${def.file}${def.scanned ? " (image-only scan)" : ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
