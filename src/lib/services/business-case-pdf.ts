import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { BRAND } from "@/lib/brand";
import {
  CURRENCY,
  costBasis,
  formatCount,
  formatDuration,
  longDate,
  paybackLine,
  quoteBasis,
  quoteTerms,
  returnFacts,
  type BusinessCaseReport,
  type QuoteMeta,
} from "@/lib/business-case";
import { formatMoney } from "@/lib/format";
import { PILOT_BILLING_NOTE, PILOT_DAYS, PILOT_PHASES } from "@/lib/pilots";
import { fontPath } from "./guarantee-pdf";

// ---------------------------------------------------------------------------
// The business case as a quotation from Sthiram, to download or e-mail: the
// services at their monthly running cost, the one-time service charges the
// presenter added, and what it returns: the same figures as the page and the
// on-screen preview (one BusinessCaseReport).
// ---------------------------------------------------------------------------

const C = {
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  canvas: "#f1f5f9",
  // Sthiram's green, from the logo.
  accent: "#048a5c",
};

const LOGO = { file: "sthiram-logo.png", width: 256, height: 62 };

const eur = (n: number) => formatMoney(Math.round(n), CURRENCY);
const pct = (n: number) => `${formatCount(Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0)))}%`;
const num = (n: number, decimals = 0) => formatCount(Number.isFinite(n) && n > 0 ? n : 0, decimals);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** "sthiram-caretrail-quotation-Q-20261017-3FA2.pdf" */
export function quotationPdfName(number: string): string {
  return `${slug(BRAND.poweredBy)}-${slug(BRAND.name)}-quotation-${number}.pdf`;
}

function logoPath(): string | null {
  const file = path.join(process.cwd(), "public", "brand", LOGO.file);
  return fs.existsSync(file) ? file : null;
}

export function renderQuotationPdf(report: BusinessCaseReport, meta: QuoteMeta): Promise<Buffer> {
  const { input, result, running, cost, quote } = report;
  const op = input.operation;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 48, left: 48, right: 48, bottom: 64 },
      bufferPages: true,
      info: { Title: `${BRAND.name} quotation ${meta.number}`, Author: BRAND.company },
    });
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

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const right = left + width;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    /** Starts a new page when the next block would run into the footer. */
    const room = (height: number) => {
      if (doc.y + height > bottom()) doc.addPage();
    };
    const rule = (y: number, color = C.line, weight = 0.6) => doc.moveTo(left, y).lineTo(right, y).lineWidth(weight).strokeColor(color).stroke();

    // Letterhead: Sthiram's logo, and the quotation's reference and dates.
    const logo = logoPath();
    const logoH = 30;
    if (logo) doc.image(logo, left, 40, { height: logoH, width: (logoH * LOGO.width) / LOGO.height });
    else doc.font(B).fontSize(18).fillColor(C.accent).text(BRAND.company, left, 44);
    doc.font(B).fontSize(22).fillColor(C.ink).text("Quotation", left, 36, { width, align: "right" });
    doc.font(R).fontSize(9).fillColor(C.muted);
    [`No. ${meta.number}`, `Date ${longDate(meta.date)}`, `Valid until ${longDate(meta.validUntil)}`].forEach((line, i) =>
      doc.text(line, left, 64 + i * 12, { width, align: "right" })
    );
    rule(108, C.accent, 1.5);

    const half = (width - 16) / 2;
    const party = (x: number, label: string, name: string, detail?: string) => {
      doc.font(R).fontSize(8.5).fillColor(C.muted).text(label, x, 122, { width: half });
      doc.font(B).fontSize(11).fillColor(C.ink).text(name, x, 134, { width: half });
      if (detail) doc.font(R).fontSize(9).fillColor(C.muted).text(detail, x, doc.y + 1, { width: half });
    };
    party(
      left,
      "Prepared for",
      quote.companyName || quote.customerName || "Your organisation",
      [quote.companyName ? quote.customerName : "", quote.email, quote.phone].filter(Boolean).join(" · ") || undefined
    );
    party(left + half + 16, "From", BRAND.company, `${BRAND.name} · ${BRAND.tagline}`);
    doc.y = 178;

    // The three numbers a buyer looks for first.
    const boxY = doc.y;
    doc.roundedRect(left, boxY, width, 70, 6).fill(C.canvas);
    const third = width / 3;
    [
      { label: "Services a month", value: eur(quote.monthlyRunningCost), note: "estimate, billed on use" },
      { label: "Service charges, one-time", value: eur(quote.oneTimeTotal), note: quote.services.length ? `${quote.services.length} ${quote.services.length === 1 ? "item" : "items"}` : "none quoted" },
      { label: "First year in total", value: eur(quote.firstYearCost), note: "one-time plus 12 months" },
    ].forEach((f, i) => {
      const x = left + i * third + 14;
      doc.font(R).fontSize(8.5).fillColor(C.muted).text(f.label, x, boxY + 12, { width: third - 28 });
      doc.font(B).fontSize(17).fillColor(C.ink).text(f.value, x, boxY + 25, { width: third - 28 });
      doc.font(R).fontSize(8).fillColor(C.muted).text(f.note, x, boxY + 49, { width: third - 28 });
    });
    doc.y = boxY + 80;
    doc.font(B).fontSize(10.5).fillColor(C.accent).text(paybackLine(report), left, doc.y, { width });
    doc.moveDown(1.4);

    /** A section title, kept on the same page as the first `keep` points of what follows. */
    const heading = (text: string, sub?: string, keep = 80) => {
      doc.y += 4;
      room(keep);
      doc.font(B).fontSize(12).fillColor(C.ink).text(text, left, doc.y, { width });
      if (sub) doc.font(R).fontSize(9).fillColor(C.muted).text(sub, left, doc.y + 2, { width });
      doc.y += 6;
    };

    /** A table with right-aligned figures; a header row only when the columns have titles. */
    const table = (columns: { title: string; width: number; align?: "left" | "right" }[], rows: string[][], total?: string[]) => {
      const xs = columns.reduce<number[]>((acc, _c, i) => [...acc, i === 0 ? left : acc[i - 1] + columns[i - 1].width], []);
      const drawRow = (cells: string[], font: string, size: number, color: string, ruled: boolean) => {
        const h = Math.max(...cells.map((cell, i) => doc.font(font).fontSize(size).heightOfString(cell, { width: columns[i].width - 8 }))) + 8;
        room(h);
        const y = doc.y;
        cells.forEach((cell, i) => {
          doc.font(font).fontSize(size).fillColor(i === 0 || font === B ? color : C.ink);
          doc.text(cell, xs[i] + (i === 0 ? 0 : 8), y + 4, { width: columns[i].width - 8, align: columns[i].align ?? "left" });
        });
        if (ruled) rule(y + h);
        doc.y = y + h;
      };
      if (columns.some((c) => c.title)) drawRow(columns.map((c) => c.title), R, 8.5, C.muted, true);
      for (const row of rows) drawRow(row, R, 9.5, C.ink, true);
      if (total) drawRow(total, B, 10, C.ink, false);
      doc.y += 10;
    };

    heading("Services, a month", "Pay-as-you-go at your volumes, billed on actual use: the voice AI, its phone line, the document AI and the cloud it runs on");
    table(
      [
        { title: "Service", width: 170 },
        { title: "Basis", width: width - 170 - 90 },
        { title: "A month", width: 90, align: "right" },
      ],
      running.lines.map((l) => [l.label, costBasis(l), eur(l.cost)]),
      ["Total a month", `${eur(running.annualCost)} a year`, eur(running.monthlyCost)]
    );

    heading("Service charges", "One-time, fixed for the validity of this quotation");
    if (quote.services.length) {
      table(
        [
          { title: "", width: 24 },
          { title: "Service", width: width - 24 - 110 },
          { title: "Amount", width: 110, align: "right" },
        ],
        quote.services.map((s, i) => [`${i + 1}`, s.description, s.amount > 0 ? eur(s.amount) : "Included"]),
        ["", "Total one-time", eur(quote.oneTimeTotal)]
      );
    } else {
      doc.font(R).fontSize(9.5).fillColor(C.muted).text("No one-time service charges in this quotation.", left, doc.y + 2, { width });
      doc.moveDown(1.6);
    }

    if (quote.pilot) {
      heading(`${PILOT_DAYS}-day pilot: ${quote.pilot.label}`, "One flow first, judged on agreed measures, before any wider roll-out", 160);
      doc.font(R).fontSize(9.5).fillColor(C.ink).text(quote.pilot.scope, left, doc.y + 2, { width, lineGap: 1.5 });
      doc.font(R).fontSize(9).fillColor(C.muted).text(PILOT_BILLING_NOTE, left, doc.y + 3, { width });
      doc.moveDown(0.6);
      doc.font(B).fontSize(9).fillColor(C.ink).text("Judged on", left, doc.y, { width });
      doc.font(R).fontSize(9).list(quote.pilot.measures, left, doc.y + 2, { width, bulletRadius: 1.6, textIndent: 10, paragraphGap: 2 });
      doc.moveDown(0.6);
      doc.font(B).fontSize(9).fillColor(C.ink).text("Plan", left, doc.y, { width });
      table(
        [
          { title: "", width: 84 },
          { title: "", width: width - 84 },
        ],
        PILOT_PHASES.map((p) => [p.days, p.what])
      );
    }

    heading("Terms", undefined, 90);
    doc
      .font(R)
      .fontSize(9)
      .fillColor(C.ink)
      .list(
        quoteTerms(meta),
        left,
        doc.y + 2,
        { width, bulletRadius: 1.6, textIndent: 10, paragraphGap: 3 }
      );
    doc.moveDown(1.2);

    heading("What it returns", `With your numbers, at a loaded cost of ${eur(op.costPerHour)} an agent hour`, 190);
    doc.font(B).fontSize(11).fillColor(C.ink).text(report.headline, left, doc.y + 2, { width, lineGap: 1.5 });
    doc.moveDown(0.8);
    const tiles = [
      { value: num(result.hoursFreed), label: "Agent hours freed a month", note: `the work of ${num(result.fte, 1)} full-time staff` },
      { value: eur(running.netAnnualSaving), label: "Net saving a year", note: `after ${eur(running.annualCost)} running cost` },
      { value: num(result.afterHoursCalls), label: "After-hours calls answered", note: "a month, instantly" },
      { value: formatDuration(result.letterMinutesAutomated), label: "Letter of Guarantee turnaround", note: `instead of ${formatDuration(result.letterMinutesToday)}` },
    ];
    const gap = 8;
    const tileW = (width - gap * 3) / 4;
    const tileY = doc.y;
    tiles.forEach((t, i) => {
      const x = left + i * (tileW + gap);
      doc.roundedRect(x, tileY, tileW, 66, 6).fill(C.canvas);
      doc.font(B).fontSize(14).fillColor(C.ink).text(t.value, x + 10, tileY + 9, { width: tileW - 20 });
      doc.font(B).fontSize(8).fillColor(C.ink).text(t.label, x + 10, tileY + 30, { width: tileW - 20 });
      doc.font(R).fontSize(8).fillColor(C.muted).text(t.note, x + 10, tileY + 48, { width: tileW - 20 });
    });
    doc.y = tileY + 66 + 10;
    const facts = returnFacts(running);
    if (facts.length) doc.font(R).fontSize(9.5).fillColor(C.ink).text(facts.join(" "), left, doc.y, { width });
    doc.moveDown(1.2);

    table(
      [
        { title: "Where the time comes from", width: width - 300 },
        { title: "Volume", width: 75, align: "right" },
        { title: "Hours today", width: 75, align: "right" },
        { title: "Hours freed", width: 75, align: "right" },
        { title: "Saving", width: 75, align: "right" },
      ],
      result.areas.map((a) => [a.label, num(a.volume), `${num(a.hoursToday)} h`, `${num(a.hoursFreed)} h`, eur(a.saving)]),
      ["Total a month", "", `${num(result.hoursToday)} h`, `${num(result.hoursFreed)} h`, eur(result.monthlySaving)]
    );

    table(
      [
        { title: "Medical spend: what bill review saves", width: width - 140 },
        { title: "", width: 140, align: "right" },
      ],
      [
        ["Medical spend abroad a year", eur(input.costContainment.annualMedicalSpend)],
        ["Bills reviewed line by line against your tariff", `${pct(input.costContainment.reviewedPct)} (${eur(cost.reviewedSpend)})`],
        ["Average saving on a reviewed bill", pct(input.costContainment.savingPct)],
      ],
      ["Medical spend saved a year", eur(cost.annualSaving)]
    );
    if (result.annualSaving > 0) {
      room(30);
      doc
        .font(B)
        .fontSize(10.5)
        .fillColor(C.accent)
        .text(`With the operating savings, after running costs: ${eur(cost.annualSaving + running.netAnnualSaving)} a year.`, left, doc.y - 6, { width });
      doc.moveDown(1.4);
    }

    heading("What this is based on", undefined, 120);
    const basis = quoteBasis(report);
    const colW = (width - 20) / 2;
    for (let r = 0; r < basis.length; r += 2) {
      const pair = basis.slice(r, r + 2);
      const h = Math.max(...pair.map(([, v]) => doc.font(R).fontSize(9).heightOfString(v, { width: colW }))) + 19;
      room(h);
      const y = doc.y;
      pair.forEach(([label, value], c) => {
        const x = left + c * (colW + 20);
        doc.font(R).fontSize(8).fillColor(C.muted).text(label, x, y + 3, { width: colW });
        doc.font(R).fontSize(9).fillColor(C.ink).text(value, x, y + 13, { width: colW });
      });
      rule(y + h);
      doc.y = y + h;
    }

    // Footer on every page. It sits in the bottom margin, which pdfkit would
    // otherwise answer with a new page.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      const y = doc.page.height - 44;
      doc.moveTo(left, y - 8).lineTo(right, y - 8).lineWidth(0.6).strokeColor(C.line).stroke();
      doc.font(R).fontSize(8).fillColor(C.muted).text(`${BRAND.company} · ${BRAND.name} quotation ${meta.number}`, left, y, { width: width - 70, lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, right - 70, y, { width: 70, align: "right", lineBreak: false });
    }
    doc.end();
  });
}
