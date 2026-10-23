import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { BRAND } from "../../src/lib/brand";
import type { Block, Field, Issuer, SampleDoc, Stamp } from "./model";

// ---------------------------------------------------------------------------
// Draws a sample document as a real-looking A4 page: letterhead with a logo,
// document meta and barcode, boxed patient details, sections, tables with
// totals, a signature and an ink stamp, and a footer.
//
// Text order matters for extraction: pdf-parse emits text in drawing order and
// joins items that share a baseline with a single space. So a field's label
// and value are drawn back to back on their own line, columns are drawn one
// after the other, and stamps are images (no text layer).
// ---------------------------------------------------------------------------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 48;
const CW = PAGE_W - 2 * M;
const BOTTOM = PAGE_H - 64;

const INK = "#0f172a";
const MUTED = "#475569";
const FAINT = "#94a3b8";
const RULE = "#cbd5e1";
const PEN = "#1e2f6e";

/** Letterhead and footer words, in the document's language. */
const CHROME: Record<SampleDoc["lang"], { tel: string; fax: string; email: string; page: string; fictional: (brand: string) => string }> = {
  en: { tel: "Tel", fax: "Fax", email: "E-mail", page: "Page 1 of 1", fictional: (b) => `Fictional sample document prepared for the ${b} demonstration. Not a real record.` },
  tr: { tel: "Tel", fax: "Faks", email: "E-posta", page: "Sayfa 1 / 1", fictional: (b) => `${b} demosu için hazırlanmış kurgusal örnek belge. Gerçek bir kayıt değildir.` },
  fr: { tel: "Tél", fax: "Fax", email: "E-mail", page: "Page 1 sur 1", fictional: (b) => `Document fictif préparé pour la démonstration ${b}. Ce n'est pas un vrai dossier.` },
  es: { tel: "Tel", fax: "Fax", email: "Correo", page: "Página 1 de 1", fictional: (b) => `Documento ficticio preparado para la demostración de ${b}. No es un registro real.` },
  pt: { tel: "Tel", fax: "Fax", email: "E-mail", page: "Página 1 de 1", fictional: (b) => `Documento fictício preparado para a demonstração ${b}. Não é um registo real.` },
};

export interface Fonts {
  regular: string;
  bold: string;
}

export interface HandSpot {
  x: number;
  y: number;
  text: string;
  size: number;
}

export interface RenderOptions {
  /** For handwritten faxes: "omit" leaves the values blank and returns where they go. */
  hand?: "text" | "omit";
  stamp?: (stamp: Stamp) => Buffer | null;
}

export function liberationFonts(): Fonts {
  const dir = path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts");
  const regular = path.join(dir, "LiberationSans-Regular.ttf");
  const bold = path.join(dir, "LiberationSans-Bold.ttf");
  if (!fs.existsSync(regular) || !fs.existsSync(bold)) throw new Error(`Liberation Sans not found in ${dir}`);
  return { regular, bold };
}

/** A small deterministic random generator, so files only change when content does. */
export function seeded(seedText: string): () => number {
  let seed = 0;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  if (seed <= 0) seed += 2147483646;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

export function renderPdf(d: SampleDoc, fonts: Fonts, opts: RenderOptions = {}): Promise<{ pdf: Buffer; hand: HandSpot[] }> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      info: {
        Title: `${d.title} ${d.meta[0]?.[1] ?? ""}`.trim(),
        Author: d.issuer.name,
        Creator: `${BRAND.name} sample generator`,
        CreationDate: new Date("2026-10-16T09:00:00Z"),
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("error", reject);

    doc.registerFont("R", fonts.regular);
    doc.registerFont("B", fonts.bold);
    const hand: HandSpot[] = [];
    const handwritten = !!d.fax?.handwritten;
    const rand = seeded(d.file);

    const fail = (msg: string) => {
      throw new Error(`${d.file}: ${msg}`);
    };

    /** One run of text with no wrapping; throws if it would not fit. */
    const put = (
      text: string,
      x: number,
      y: number,
      o: { font?: "R" | "B"; size?: number; color?: string; max?: number; right?: boolean; spacing?: number } = {}
    ) => {
      doc.font(o.font ?? "R").fontSize(o.size ?? 9);
      const w = doc.widthOfString(text, { characterSpacing: o.spacing ?? 0 });
      if (o.max != null && w > o.max + 0.5) fail(`"${text}" is ${Math.round(w)}pt wide, room for ${Math.round(o.max)}pt`);
      doc.fillColor(o.color ?? INK).text(text, o.right ? x - w : x, y, { lineBreak: false, characterSpacing: o.spacing ?? 0 });
      return w;
    };

    const field = ([label, value]: Field, x: number, y: number, labelWidth: number, width: number) => {
      put(label, x, y, { color: MUTED, max: labelWidth - 4 });
      if (handwritten && opts.hand === "omit") {
        doc.save().dash(1, { space: 2 }).moveTo(x + labelWidth, y + 10).lineTo(x + width - 6, y + 10).lineWidth(0.5).strokeColor(FAINT).stroke().restore();
        hand.push({ x: x + labelWidth, y, text: value, size: 9 });
        return;
      }
      put(value, x + labelWidth, y, { font: "B", max: width - labelWidth });
    };

    // --- Letterhead -------------------------------------------------------
    drawLogo(doc, d.issuer, M, 38, 36);
    put(d.issuer.name, M + 46, 38, { font: "B", size: 15, color: d.issuer.color, max: 300 });
    put(d.issuer.tagline, M + 46, 57, { size: 8.5, color: MUTED, max: 300 });
    put(d.issuer.address[0], M + 46, 69, { size: 8, color: MUTED });
    put(d.issuer.address[1], M + 46, 79, { size: 8, color: MUTED });
    const words = CHROME[d.lang];
    const contact = [
      `${words.tel}: ${d.issuer.phone}`,
      `${words.fax}: ${d.issuer.fax}`,
      `${words.email}: ${d.issuer.email}`,
      d.issuer.web,
    ];
    contact.forEach((line, i) => put(line, PAGE_W - M, 40 + i * 10.5, { size: 8, color: MUTED, right: true }));
    doc.rect(M, 95, CW, 2.2).fill(d.issuer.color);
    doc.rect(M, 98.6, CW, 0.8).fill(RULE);

    // --- Title and meta ---------------------------------------------------
    const titleRoom = CW - 216;
    doc.font("B").fontSize(17);
    const titleSize = Math.max(13, Math.min(17, (17 * titleRoom) / doc.widthOfString(d.title, { characterSpacing: 0.8 })));
    put(d.title, M, 114 + (17 - titleSize) / 2, { font: "B", size: titleSize, spacing: 0.8, max: titleRoom });
    if (d.subtitle) put(d.subtitle, M, 136, { size: 9, color: MUTED, max: CW - 220 });
    const metaX = PAGE_W - M - 200;
    d.meta.forEach(([label, value], i) => {
      put(label, metaX, 114 + i * 12.5, { size: 8.5, color: MUTED, max: 82 });
      put(value, metaX + 84, 114 + i * 12.5, { font: "B", size: 8.5, max: 116 });
    });
    const barY = 114 + d.meta.length * 12.5 + 3;
    drawBarcode(doc, metaX + 84, barY, 116, 16, d.meta[0]?.[1] ?? d.file);
    let y = Math.max(158, barY + 28);

    const room = (h: number) => {
      if (y + h > BOTTOM) fail(`content runs past the page (needs ${Math.round(y + h - BOTTOM)}pt more)`);
    };

    const heading = (text: string) => {
      room(24);
      put(text, M, y, { font: "B", size: 10.5, color: d.issuer.color });
      doc.moveTo(M, y + 15).lineTo(M + CW, y + 15).lineWidth(0.6).strokeColor(RULE).stroke();
      y += 21;
    };

    const paragraph = (text: string, size = 9.5, color = INK) => {
      doc.font("R").fontSize(size);
      const h = doc.heightOfString(text, { width: CW, lineGap: 2.2 });
      room(h);
      doc.fillColor(color).text(text, M, y, { width: CW, lineGap: 2.2 });
      y += h + 5;
    };

    for (const block of d.blocks) drawBlock(block);

    function drawBlock(b: Block) {
      switch (b.type) {
        case "fields": {
          const pad = 10;
          const rowH = 15;
          const titleH = b.title ? 15 : 0;
          const rows = Math.max(b.left.length, b.right?.length ?? 0);
          const h = pad * 2 + titleH + rows * rowH - 5;
          room(h + 10);
          doc.lineWidth(0.6).roundedRect(M, y, CW, h, 5).fillAndStroke(d.issuer.tint, RULE);
          if (b.title) put(b.title, M + pad, y + pad, { font: "B", size: 8.5, color: d.issuer.color });
          const split = b.right ? (b.split ?? 0.5) : 1;
          const lw = b.labelWidth ?? 88;
          const top = y + pad + titleH;
          const left = () => b.left.forEach((f, i) => field(f, M + pad, top + i * rowH, lw, CW * split - pad * 2));
          const right = () => b.right?.forEach((f, i) => field(f, M + CW * split + pad, top + i * rowH, lw, CW * (1 - split) - pad * 2));
          // Columns are drawn one after the other; the last line of the first
          // must not share a baseline with the first line of the second.
          const r = b.right?.length ?? 0;
          if (b.left.length === 1 && r === 1) fail("a box with one field per column would read as one line; add a row");
          if (b.left.length === 1 && r > 1) {
            right();
            left();
          } else {
            left();
            right();
          }
          y += h + 12;
          break;
        }
        case "section": {
          heading(b.heading);
          const lw = b.labelWidth ?? 110;
          for (const f of b.fields ?? []) {
            room(15);
            field(f, M, y, lw, CW);
            y += 15;
          }
          if (b.fields?.length && b.text?.length) y += 3;
          for (const p of b.text ?? []) paragraph(p);
          y += 6;
          break;
        }
        case "table": {
          if (b.heading) heading(b.heading);
          const widths = b.columns.map((c) => c.width * CW);
          const xs = widths.map((_, i) => M + widths.slice(0, i).reduce((s, w) => s + w, 0));
          const cell = (text: string, i: number, yy: number, o: { font?: "R" | "B"; color?: string; size?: number }) => {
            const right = b.columns[i].align === "right";
            put(text, right ? xs[i] + widths[i] - 6 : xs[i] + 6, yy, { ...o, right, max: widths[i] - 10 });
          };
          room(20 + b.rows.length * 16);
          doc.rect(M, y, CW, 18).fill(d.issuer.tint);
          b.columns.forEach((c, i) => cell(c.label, i, y + 5, { font: "B", size: 8.5, color: d.issuer.color }));
          y += 18;
          b.rows.forEach((row, r) => {
            if (r % 2 === 1) doc.rect(M, y, CW, 16).fill("#f8fafc");
            row.forEach((text, i) => (text ? cell(text, i, y + 4, {}) : null));
            y += 16;
          });
          doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.8).strokeColor(RULE).stroke();
          y += 6;
          for (const t of b.totals ?? []) {
            const size = t.strong ? 10.5 : 9;
            const h = t.strong ? 22 : 15;
            room(h);
            if (t.strong) doc.rect(M + CW - 250, y - 2, 250, h).fill(d.issuer.tint);
            put(t.label, M + CW - 110, y + (t.strong ? 4 : 1), { font: t.strong ? "B" : "R", size, color: t.strong ? INK : MUTED, right: true, max: 136 });
            put(t.value, M + CW - 6, y + (t.strong ? 4 : 1), { font: "B", size, right: true, max: 100 });
            y += h + 1;
          }
          y += 4;
          if (b.note) paragraph(b.note, 8.5, MUTED);
          y += 4;
          break;
        }
        case "rx": {
          room(32);
          put("Rx", M, y, { font: "B", size: 22, color: d.issuer.color });
          y += 32;
          break;
        }
        case "text": {
          for (const p of b.text) paragraph(p, b.muted ? 8 : 9.5, b.muted ? FAINT : INK);
          break;
        }
        case "signature": {
          room(92);
          const x0 = M + CW - 210;
          if (b.place) put(b.place, M, y + 40, { color: MUTED });
          if (!b.unsigned && !(handwritten && opts.hand === "omit")) drawSignature(doc, x0 + 24, y + 4, 160, 38, rand);
          const stamp = b.stamp && opts.stamp?.(b.stamp);
          // Ink is translucent: the text under a stamp still shows through.
          if (stamp) doc.save().opacity(0.86).image(stamp, x0 + 104, y - 24, { width: 100 }).restore();
          doc.moveTo(x0, y + 46).lineTo(x0 + 210, y + 46).lineWidth(0.6).strokeColor(FAINT).stroke();
          if (handwritten && opts.hand === "omit") hand.push({ x: x0 + 6, y: y + 18, text: b.name, size: 14 });
          else put(b.name, x0, y + 50, { font: "B", size: 9.5, max: 210 });
          put(b.role, x0, y + 63, { size: 8, color: MUTED, max: 210 });
          put(b.caption, x0, y + 74, { size: 7.5, color: FAINT, max: 210 });
          y += 94;
          break;
        }
      }
    }

    // --- Footer -----------------------------------------------------------
    doc.moveTo(M, PAGE_H - 50).lineTo(M + CW, PAGE_H - 50).lineWidth(0.6).strokeColor(RULE).stroke();
    put(d.issuer.registry, M, PAGE_H - 43, { size: 7, color: FAINT, max: CW - 70 });
    put(words.fictional(BRAND.name), M, PAGE_H - 33, { size: 7, color: FAINT, max: CW - 70 });
    put(words.page, PAGE_W - M, PAGE_H - 43, { size: 7, color: FAINT, right: true });

    doc.on("end", () => resolve({ pdf: Buffer.concat(chunks), hand }));
    doc.end();
  });
}

function drawLogo(doc: PDFKit.PDFDocument, issuer: Issuer, x: number, y: number, s: number) {
  const c = issuer.color;
  doc.save();
  switch (issuer.logo) {
    case "cross": {
      doc.roundedRect(x, y, s, s, s * 0.22).fill(c);
      const t = s * 0.2;
      doc.rect(x + s / 2 - t / 2, y + s * 0.2, t, s * 0.6).fill("#ffffff");
      doc.rect(x + s * 0.2, y + s / 2 - t / 2, s * 0.6, t).fill("#ffffff");
      break;
    }
    case "heart": {
      const cx = x + s / 2;
      doc
        .moveTo(cx, y + s * 0.92)
        .bezierCurveTo(x - s * 0.05, y + s * 0.5, x + s * 0.12, y + s * 0.02, cx, y + s * 0.28)
        .bezierCurveTo(x + s * 0.88, y + s * 0.02, x + s * 1.05, y + s * 0.5, cx, y + s * 0.92)
        .fill(c);
      doc
        .moveTo(x + s * 0.1, y + s * 0.5)
        .lineTo(x + s * 0.34, y + s * 0.5)
        .lineTo(x + s * 0.42, y + s * 0.34)
        .lineTo(x + s * 0.52, y + s * 0.7)
        .lineTo(x + s * 0.6, y + s * 0.46)
        .lineTo(x + s * 0.9, y + s * 0.46)
        .lineWidth(s * 0.07)
        .lineJoin("round")
        .lineCap("round")
        .strokeColor("#ffffff")
        .stroke();
      break;
    }
    case "joint": {
      doc.circle(x + s / 2, y + s / 2, s / 2).fill(c);
      doc.save();
      doc.rotate(-40, { origin: [x + s / 2, y + s / 2] });
      const bx = x + s * 0.2;
      const by = y + s / 2;
      doc.roundedRect(bx + s * 0.08, by - s * 0.07, s * 0.44, s * 0.14, s * 0.05).fill("#ffffff");
      for (const [dx, dy] of [
        [0.1, -0.08],
        [0.1, 0.08],
        [0.5, -0.08],
        [0.5, 0.08],
      ]) {
        doc.circle(bx + s * dx, by + s * dy, s * 0.09).fill("#ffffff");
      }
      doc.restore();
      break;
    }
    case "arc": {
      doc.circle(x + s / 2, y + s / 2, s / 2).fill(c);
      for (const [r, w] of [
        [0.32, 0.07],
        [0.2, 0.07],
      ]) {
        doc
          .path(`M ${x + s * (0.5 - r)} ${y + s * 0.62} A ${s * r} ${s * r} 0 0 1 ${x + s * (0.5 + r)} ${y + s * 0.62}`)
          .lineWidth(s * w)
          .lineCap("round")
          .strokeColor("#ffffff")
          .stroke();
      }
      doc.circle(x + s / 2, y + s * 0.62, s * 0.07).fill("#ffffff");
      break;
    }
  }
  doc.restore();
}

/** A barcode-like strip under the document number (decorative, not machine readable). */
function drawBarcode(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, value: string) {
  const rand = seeded(value);
  let cx = x;
  doc.save();
  while (cx < x + w - 2) {
    const bar = 0.6 + Math.floor(rand() * 3) * 0.6;
    doc.rect(cx, y, bar, h).fill(INK);
    cx += bar + 0.6 + Math.floor(rand() * 3) * 0.7;
  }
  doc.restore();
}

/**
 * A pen signature: a tall capital, a run of joined loops of uneven height and
 * a trailing flourish. Different for every document, never legible.
 */
function drawSignature(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, rand: () => number) {
  doc.save();
  doc.lineWidth(1.15).lineCap("round").lineJoin("round").strokeColor(PEN);
  const base = y + h * 0.72;
  // Capital: up, over and down into the run.
  doc
    .moveTo(x + 2, base + h * 0.1)
    .bezierCurveTo(x + 4, y - h * 0.15, x + 22, y - h * 0.1, x + 14, base - h * 0.05)
    .bezierCurveTo(x + 10, base + h * 0.2, x + 4, base, x + 20, base - h * 0.2)
    .stroke();
  // The run: a prolate cycloid, which writes as joined loops.
  const loops = 6 + Math.floor(rand() * 4);
  const run = w * (0.62 + rand() * 0.12);
  const r = run / (2 * Math.PI * loops);
  const amps = Array.from({ length: loops + 1 }, () => 0.3 + rand() * 0.55);
  const x1 = x + 20;
  doc.moveTo(x1, base - h * 0.2);
  const steps = loops * 24;
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * loops * 2 * Math.PI;
    const k = Math.min(loops - 1, Math.floor(t / (2 * Math.PI)));
    const f = t / (2 * Math.PI) - k;
    const amp = (amps[k] * (1 - f) + amps[k + 1] * f) * h;
    const d = r * (1.9 + amps[k]);
    const px = x1 + r * t - d * Math.sin(t);
    const py = base - h * 0.2 - (amp * (1 - Math.cos(t))) / 2 + (i / steps) * h * 0.12;
    doc.lineTo(px, py);
  }
  doc.stroke();
  // Flourish: back under the name, rising at the end.
  const ex = x1 + run;
  doc
    .moveTo(ex, base - h * 0.05)
    .bezierCurveTo(ex + w * 0.12, base + h * 0.25, x + w * 0.2, base + h * 0.42, x + w * 0.08, base + h * 0.2)
    .stroke();
  doc.restore();
}
