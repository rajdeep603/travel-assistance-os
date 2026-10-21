import PDFDocument from "pdfkit";
import { BRAND, POWERED_BY } from "@/lib/brand";
import { formatDateTime, formatEnum, formatMoney } from "@/lib/format";
import { timeZoneLabel } from "@/lib/time-zone";
import { fontPath } from "./guarantee-pdf";
import { formatShortDuration } from "./outcomes";
import { CASE_STATUS_ORDER, CLAIM_STATUS_ORDER, type Overview } from "./overview";

// ---------------------------------------------------------------------------
// The operations summary: the overview on one A4 page, for the buyer who asks
// "can I have those numbers?". The same figures as the dashboard, from the
// same Overview, with the period and the clock they are shown in.
// ---------------------------------------------------------------------------

const C = {
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  canvas: "#f1f5f9",
  brand: "#2563eb",
  stage: "#09152b",
  stageMuted: "#94a3b8",
  live: "#14b8a6",
};

const eur = (n: number) => formatMoney(Math.round(n), "EUR");
const pct = (share: number | null) => (share == null ? "—" : `${Math.round(share * 100)}%`);
const dur = (seconds: number | null) => (seconds == null ? "—" : formatShortDuration(seconds));

/** "caretrail-operations-summary-30-days-2026-10-22.pdf" */
export function overviewPdfName(days: number, date: string): string {
  return `${BRAND.name.toLowerCase()}-operations-summary-${days}-days-${date}.pdf`;
}

export function renderOverviewPdf(o: Overview, opts: { timeZone: string; now?: Date }): Promise<Buffer> {
  const now = opts.now ?? new Date();
  const { outcomes: out, money } = o;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, left: 44, right: 44, bottom: 44 },
      info: { Title: `${BRAND.name} operations summary, last ${o.days} days`, Author: BRAND.company },
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
    let y = doc.page.margins.top;

    const text = (str: string, x: number, at: number, opt: { font?: string; size?: number; color?: string; width?: number; align?: "left" | "right" | "center" } = {}) => {
      doc.font(opt.font ?? R).fontSize(opt.size ?? 9.5).fillColor(opt.color ?? C.ink);
      doc.text(str, x, at, { width: opt.width ?? width, align: opt.align ?? "left", lineBreak: true });
      return doc.y;
    };
    const rule = (at: number, color = C.line) => {
      doc.moveTo(left, at).lineTo(right, at).lineWidth(0.6).strokeColor(color).stroke();
    };
    const heading = (str: string, at: number) => {
      text(str, left, at, { font: B, size: 11 });
      rule(at + 16);
      return at + 24;
    };

    // --- Letterhead: the stage, as on screen ---------------------------------
    doc.roundedRect(left, y, width, 132, 12).fill(C.stage);
    text(BRAND.name, left + 20, y + 18, { font: B, size: 24, color: "#ffffff" });
    text(BRAND.tagline, left + 20, y + 48, { size: 11, color: "#38bdf8" });
    text("Operations summary", right - 240, y + 20, { font: B, size: 13, color: "#ffffff", width: 220, align: "right" });
    text(`Last ${o.days} days, to ${formatDateTime(now, opts.timeZone)}`, right - 240, y + 40, { size: 9, color: C.stageMuted, width: 220, align: "right" });
    text(`Times in ${timeZoneLabel(opts.timeZone)} time`, right - 240, y + 53, { size: 9, color: C.stageMuted, width: 220, align: "right" });

    // The four outcomes, as the strip under the route on screen.
    const outcomes = [
      { value: pct(out.calls.aiShare), label: "of calls handled end-to-end by AI", note: out.calls.ended ? `${out.calls.byAi} of ${out.calls.ended} calls; ${out.calls.transferred} handed to a person` : "No calls yet" },
      { value: out.calls.answerSeconds == null ? "Instant" : dur(out.calls.answerSeconds), label: "to answer a call, day or night", note: "Every call is picked up by AI; no queue" },
      { value: pct(out.inbox.automatedShare), label: "of e-mails and faxes handled automatically", note: out.inbox.replyMinutes != null ? `Median reply in ${dur(out.inbox.replyMinutes * 60)}` : `${out.inbox.automated} of ${out.inbox.received} received` },
      { value: out.letters.turnaroundMinutes == null ? "—" : dur(out.letters.turnaroundMinutes * 60), label: "from cost estimate to Letter of Guarantee", note: `${out.letters.sent} sent to hospitals` },
    ];
    const colW = (width - 40) / 4;
    outcomes.forEach((item, i) => {
      const x = left + 20 + i * colW;
      text(item.value, x, y + 68, { font: B, size: 18, color: "#ffffff", width: colW - 10 });
      text(item.label, x, y + 89, { font: B, size: 7.5, color: "#e2e8f0", width: colW - 12 });
      text(item.note, x, y + 109, { size: 7, color: C.stageMuted, width: colW - 12 });
    });
    y += 132 + 18;

    // --- Medical spend and what needs a person --------------------------------
    y = heading("Medical spend under control", y);
    const half = (width - 24) / 2;
    const figure = (value: string, label: string, note: string, x: number, at: number, w: number) => {
      text(value, x, at, { font: B, size: 20, width: w });
      const afterLabel = text(label, x, at + 24, { font: B, size: 9, width: w });
      return text(note, x, afterLabel + 1, { size: 8, color: C.muted, width: w }) + 6;
    };
    let y1 = figure(eur(money.savingsIdentifiedEur), "found above the reference tariff", `On ${money.billsReviewed} hospital ${money.billsReviewed === 1 ? "bill" : "bills"} reviewed line by line: overcharges, extra nights, duplicates and comfort items`, left, y, half);
    let y2 = figure(eur(money.savingsAcceptedEur), "saved, accepted by a person", money.averageSavingShare != null ? `${pct(money.averageSavingShare)} average saving on reviewed bills` : "No review accepted yet", left + half + 24, y, half);
    y = Math.max(y1, y2) + 4;
    y1 = figure(eur(money.openGuarantees.eur), "committed in open guarantees", `${money.openGuarantees.count} ${money.openGuarantees.count === 1 ? "letter" : "letters"} on open cases, counted against each policy's limit`, left, y, half);
    const waiting = o.decisions.reduce((n, d) => n + d.count, 0);
    y2 = figure(String(waiting), "decisions waiting for a person", o.decisions.filter((d) => d.count).map((d) => `${d.count} ${d.label}`).join(" · ") || "Nothing waiting", left + half + 24, y, half);
    y = Math.max(y1, y2) + 10;

    // --- Caseload and claims ----------------------------------------------------
    y = heading("Caseload and claims", y);
    const mix = (title: string, total: number, noun: string, counts: Record<string, number>, order: string[], x: number, at: number, w: number) => {
      text(`${total} ${noun}`, x, at, { font: B, size: 12, width: w });
      let row = at + 18;
      for (const status of order) {
        const n = counts[status] ?? 0;
        text(formatEnum(status), x, row, { size: 8.5, color: n ? C.ink : C.muted, width: w - 40 });
        text(String(n), x + w - 40, row, { font: B, size: 8.5, color: n ? C.ink : C.muted, width: 40, align: "right" });
        row += 12;
      }
      return row;
    };
    const caseTotal = Object.values(o.caseCounts).reduce((a, b) => a + b, 0);
    const claimTotal = Object.values(o.claimCounts).reduce((a, b) => a + b, 0);
    y1 = mix(`Caseload`, caseTotal, caseTotal === 1 ? "case" : "cases", o.caseCounts, CASE_STATUS_ORDER, left, y, half);
    y2 = mix(`Claims`, claimTotal, claimTotal === 1 ? "claim" : "claims", o.claimCounts, CLAIM_STATUS_ORDER, left + half + 24, y, half);
    y = Math.max(y1, y2) + 8;
    text(`${o.openCases} open cases · ${o.claimsInReview} claims in review · ${o.upcomingAppointments} upcoming appointments · ${o.documentsProcessed} medical documents read by AI`, left, y, { size: 8.5, color: C.muted });
    y += 20;

    // --- Last night ---------------------------------------------------------------
    if (o.handover) {
      const h = o.handover;
      y = heading(`While the team slept: night shift ${formatDateTime(h.start, opts.timeZone)} to ${formatDateTime(h.end, opts.timeZone)}`, y);
      const night = [
        [String(h.calls.byAi), "calls handled by AI", h.calls.total ? `of ${h.calls.total}; ${h.calls.transferred} handed to a person` : "no calls"],
        [String(h.calls.emergencies), "emergencies put through to a doctor", "the AI opened the case and briefed them"],
        [String(h.cases.opened), "cases opened", h.cases.critical ? `${h.cases.critical} critical` : "with urgency and place set"],
        [String(h.lettersSent), "guarantees sent to hospitals", h.inbox.received ? `${h.inbox.automated} of ${h.inbox.received} e-mails and faxes handled` : "no e-mails or faxes overnight"],
      ];
      const qw = (width - 36) / 4;
      let bottom = y;
      night.forEach(([value, label, note], i) => {
        const x = left + i * (qw + 12);
        text(value, x, y, { font: B, size: 16, width: qw });
        // The note sits under the label wherever the label ends, so a two-line label never runs into it.
        const afterLabel = text(label, x, y + 19, { font: B, size: 8, width: qw });
        bottom = Math.max(bottom, text(note, x, afterLabel + 1, { size: 7.5, color: C.muted, width: qw }));
      });
      y = bottom + 10;
      if (h.calls.languages.length) {
        text(`Languages overnight: ${h.calls.languages.join(", ")}`, left, y, { size: 8.5, color: C.muted });
        y += 16;
      }
    }

    if (out.languages.length) {
      text(`Languages served in the period: ${out.languages.join(", ")}`, left, y, { size: 8.5, color: C.muted });
      y += 16;
    }

    // --- People stay in charge ---------------------------------------------------
    y += 4;
    doc.roundedRect(left, y, width, 46, 8).fill(C.canvas);
    text("People stay in charge", left + 14, y + 10, { font: B, size: 9.5, width: width - 28 });
    text(
      "The AI prepares every step and records what it did. Medical advice, paying a claim, a guarantee above the automatic limit and settling a hospital bill are decided by a person, every time.",
      left + 14,
      y + 23,
      { size: 8.5, color: C.muted, width: width - 28 }
    );
    y += 46;

    // --- Footer --------------------------------------------------------------------
    const footY = doc.page.height - doc.page.margins.bottom - 10;
    rule(footY - 8);
    text(`${POWERED_BY} · ${BRAND.company} · Figures from the demonstration environment (fictional records) · Generated ${formatDateTime(now, opts.timeZone)}`, left, footY, { size: 7.5, color: C.muted });

    doc.end();
  });
}
