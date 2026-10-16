import fs from "node:fs";
import PDFDocument from "pdfkit";
import type { SampleDoc, Stamp } from "./model";
import { seeded, type Fonts, type HandSpot } from "./render";

// ---------------------------------------------------------------------------
// The image side of the samples (@napi-rs/canvas, which pdf-parse already
// depends on): ink stamps, and fax scans. A fax is the real page rendered to
// pixels, with handwriting written on where the form was filled in by hand,
// then reduced to black and white at fax resolution, tilted, speckled and
// given the sending machine's header line. The result has no text layer.
// ---------------------------------------------------------------------------

type Canvas = typeof import("@napi-rs/canvas");

const HAND_FONTS = [
  "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf",
  "/System/Library/Fonts/Noteworthy.ttc",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
];

export interface Raster {
  stamp(stamp: Stamp): Buffer;
  fax(pdf: Buffer, d: SampleDoc, hand: HandSpot[]): Promise<Buffer>;
  hasHandwriting: boolean;
}

export async function loadRaster(fonts: Fonts): Promise<Raster | null> {
  let canvas: Canvas;
  try {
    canvas = await import("@napi-rs/canvas");
  } catch {
    return null;
  }
  const { createCanvas, loadImage, GlobalFonts } = canvas;
  GlobalFonts.registerFromPath(fonts.regular, "SampleSans");
  GlobalFonts.registerFromPath(fonts.bold, "SampleSansBold");
  const handFont = HAND_FONTS.find((p) => fs.existsSync(p));
  if (handFont) GlobalFonts.registerFromPath(handFont, "SampleHand");

  const stampCache = new Map<string, Buffer>();

  function stamp(s: Stamp): Buffer {
    const key = JSON.stringify(s);
    const hit = stampCache.get(key);
    if (hit) return hit;
    const S = 420;
    const c = createCanvas(S, S);
    const ctx = c.getContext("2d");
    const rand = seeded(key);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-0.18 - rand() * 0.12);
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 190, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 138, 0, Math.PI * 2);
    ctx.stroke();

    // The ring text, centred on the top of the circle.
    ctx.font = "30px SampleSansBold";
    const radius = 152;
    const widths = [...s.ring].map((ch) => ctx.measureText(ch).width + 2);
    const total = widths.reduce((a, b) => a + b, 0);
    const spread = Math.min(total / radius, Math.PI * 1.9);
    let angle = -Math.PI / 2 - spread / 2;
    [...s.ring].forEach((ch, i) => {
      const a = angle + widths[i] / radius / 2;
      ctx.save();
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(ch, -widths[i] / 2 + 1, -radius);
      ctx.restore();
      angle += (widths[i] / total) * spread;
    });

    // The middle lines.
    const lines = s.center;
    const sizes = lines.map((_, i) => (i === 0 ? 40 : 30));
    const height = sizes.reduce((a, b) => a + b * 1.15, 0);
    let y = -height / 2 + sizes[0] * 0.85;
    lines.forEach((line, i) => {
      ctx.font = `${sizes[i]}px SampleSansBold`;
      const w = ctx.measureText(line).width;
      ctx.fillText(line, -Math.min(w, 250) / 2, y, 250);
      y += sizes[i] * 1.15;
    });

    // Uneven ink: knock out specks and a few pale patches.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 900; i++) {
      ctx.globalAlpha = 0.25 + rand() * 0.75;
      ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 3, 1 + rand() * 3);
    }
    for (let i = 0; i < 7; i++) {
      ctx.globalAlpha = 0.18 + rand() * 0.2;
      ctx.beginPath();
      ctx.arc(rand() * S, rand() * S, 20 + rand() * 50, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const png = c.toBuffer("image/png");
    stampCache.set(key, png);
    return png;
  }

  async function fax(pdf: Buffer, d: SampleDoc, hand: HandSpot[]): Promise<Buffer> {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(pdf) });
    const shot = await parser.getScreenshot({ desiredWidth: 1240, imageBuffer: true, imageDataUrl: false });
    await parser.destroy();
    const page = await loadImage(Buffer.from(shot.pages[0].data));
    const W = page.width;
    const H = page.height;
    const k = W / 595.28;
    const rand = seeded(`${d.file}:fax`);

    const base = createCanvas(W, H);
    const b = base.getContext("2d");
    b.fillStyle = "#ffffff";
    b.fillRect(0, 0, W, H);
    b.drawImage(page, 0, 0);

    // Handwriting where the form was filled in.
    b.fillStyle = "#14215a";
    for (const spot of hand) {
      const size = (spot.size + 4) * k;
      b.save();
      b.translate(spot.x * k + 2, spot.y * k + size * 0.78);
      b.rotate((rand() - 0.5) * 0.035);
      b.font = `${Math.round(size)}px ${handFont ? "SampleHand" : "SampleSans"}`;
      b.fillText(spot.text, 0, 0);
      b.restore();
    }

    // Black and white with a noisy threshold, at fax "fine" vertical resolution.
    const img = b.getImageData(0, 0, W, H);
    const px = img.data;
    for (let y = 0; y < H; y++) {
      const src = y - (y % 2);
      for (let x = 0; x < W; x++) {
        const i = (src * W + x) * 4;
        const lum = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
        const v = lum + (rand() - 0.5) * 60 < 168 ? 0 : 255;
        const o = (y * W + x) * 4;
        px[o] = px[o + 1] = px[o + 2] = v;
        px[o + 3] = 255;
      }
    }
    b.putImageData(img, 0, 0);

    const out = createCanvas(W, H);
    const o = out.getContext("2d");
    o.fillStyle = "#ffffff";
    o.fillRect(0, 0, W, H);
    o.save();
    o.translate(W / 2, H / 2 + 14);
    o.rotate((0.55 * Math.PI) / 180);
    o.drawImage(base, -W / 2 + 6, -H / 2);
    o.restore();

    // The sending machine's header line.
    o.fillStyle = "#000000";
    o.font = "19px SampleSans";
    const f = d.fax!;
    o.fillText(`${f.sentAt}   FROM: ${f.from}   ${f.station}   TO: ${f.to}   P.001/001`, 34, 26);

    // Speckle and the faint bands of a worn drum.
    for (let i = 0; i < 2400; i++) o.fillRect(rand() * W, rand() * H, 1 + rand() * 1.6, 1 + rand() * 1.6);
    o.fillStyle = "rgba(0,0,0,0.06)";
    for (let i = 0; i < 5; i++) o.fillRect(0, rand() * H, W, 2 + rand() * 3);

    const png = out.toBuffer("image/png");
    return imagePdf(png, d);
  }

  return { stamp, fax, hasHandwriting: !!handFont };
}

function imagePdf(png: Buffer, d: SampleDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      info: { Title: `Fax from ${d.fax!.from}`, CreationDate: new Date("2026-10-16T09:00:00Z") },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.image(png, 0, 0, { width: doc.page.width, height: doc.page.height });
    doc.end();
  });
}
