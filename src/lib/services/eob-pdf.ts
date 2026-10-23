import PDFDocument from "pdfkit";
import { BRAND, POWERED_BY } from "@/lib/brand";
import { formatPlainDate } from "@/lib/time";
import { fontPath } from "./guarantee-pdf";
import { REMARKS, type Settlement } from "./settlement";

// ---------------------------------------------------------------------------
// The explanation of benefits (EOB) issued with a settlement: per line what
// was billed and what the plan allows, with remark codes, then what the plan
// pays and what the traveller owes. Same fonts and DEMO watermark as the
// Letter of Guarantee.
// ---------------------------------------------------------------------------

export interface EobContent {
  claimRef: string;
  issuedOn: string;
  member: { name: string; dateOfBirth: string; policy: string; plan: string };
  provider: string;
  service: { from: string | null; to: string | null; diagnosis: string | null };
  settlement: Settlement;
  approvedBy: string;
}

const num = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function renderEob(c: EobContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Explanation of benefits ${c.claimRef}` } });
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
    const s = c.settlement;
    const ccy = s.currency;
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    const watermark = () => {
      doc.save();
      doc.rotate(-35, { origin: [300, 420] });
      doc.font(B).fontSize(50).fillColor("#d9534f").opacity(0.1).text("DEMO — FICTIONAL DATA", 40, 400, { width: 560, align: "center" });
      doc.restore();
      doc.opacity(1).fillColor("#000000");
    };
    watermark();
    doc.x = left;
    doc.y = doc.page.margins.top;

    doc.font(B).fontSize(17).text("EXPLANATION OF BENEFITS");
    doc.font(R).fontSize(9).fillColor("#555555").text(`${BRAND.name} · ${POWERED_BY} — demonstration build. Fictional data; this document has no legal or financial effect.`);
    doc.fillColor("#000000").moveDown(0.8);

    const pair = (label: string, value: string) => doc.font(B).fontSize(9.5).text(`${label}: `, { continued: true }).font(R).text(value);
    pair("Claim", c.claimRef);
    pair("Issued", formatPlainDate(c.issuedOn, { day: "numeric", month: "long", year: "numeric" }));
    pair("Member", `${c.member.name} (born ${c.member.dateOfBirth})`);
    pair("Policy", `${c.member.policy}, ${c.member.plan} plan`);
    pair("Provider", c.provider);
    if (c.service.from) pair("Service dates", c.service.to ? `${c.service.from} to ${c.service.to}` : c.service.from);
    if (c.service.diagnosis) pair("Diagnosis", c.service.diagnosis);
    pair("Benefit", s.benefit.label);
    doc.moveDown(0.8);

    // --- Lines ------------------------------------------------------------
    const cols = [
      { label: "Code", w: 0.1, align: "left" as const },
      { label: "Service", w: 0.42, align: "left" as const },
      { label: `Billed (${ccy})`, w: 0.16, align: "right" as const },
      { label: `Allowed (${ccy})`, w: 0.16, align: "right" as const },
      { label: "Remarks", w: 0.16, align: "left" as const },
    ];
    const header = () => {
      const y = doc.y;
      doc.rect(left, y - 2, width, 16).fill("#eef2ff");
      doc.fillColor("#1e293b").font(B).fontSize(8.5);
      let x = left + 4;
      for (const col of cols) {
        doc.text(col.label, x, y + 2, { width: col.w * width - 8, align: col.align });
        x += col.w * width;
      }
      doc.y = y + 18;
    };
    header();
    doc.font(R).fontSize(8.5).fillColor("#000000");
    for (const line of s.lines) {
      const codes = line.remarks.map((r) => r.split(" ")[0]).join(" ");
      const h = Math.max(12, doc.heightOfString(line.description, { width: cols[1].w * width - 8 }));
      if (doc.y + h > doc.page.height - doc.page.margins.bottom - 150) {
        doc.addPage();
        watermark();
        doc.y = doc.page.margins.top;
        header();
        doc.font(R).fontSize(8.5).fillColor("#000000");
      }
      const y = doc.y;
      const cells = [line.code ?? "", line.description, num(line.billed), num(line.allowed), codes];
      let x = left + 4;
      cells.forEach((text, i) => {
        doc.fillColor(i === 3 && line.allowed < line.billed ? "#b45309" : "#000000").text(text, x, y, { width: cols[i].w * width - 8, align: cols[i].align });
        x += cols[i].w * width;
      });
      doc.y = y + h + 3;
      doc.moveTo(left, doc.y - 1).lineTo(left + width, doc.y - 1).lineWidth(0.3).strokeColor("#e2e8f0").stroke();
    }
    doc.fillColor("#000000");
    doc.x = left;
    doc.moveDown(0.6);

    // --- Summary ----------------------------------------------------------
    const summary: [string, number, boolean?][] = [
      ["Total billed", s.billed],
      ["Never covered (comfort items, duplicates)", -s.notCovered],
      ["Above the reference or network price, extra nights", -s.aboveReference],
      ["Allowed by the plan", s.allowed, true],
      ["Excess (paid by the member)", -s.excess],
      ...(s.overLimit > 0 ? ([["Above the remaining policy limit", -s.overLimit]] as [string, number][]) : []),
      ["The plan pays", s.payable, true],
      ["The member pays", s.travellerPays, true],
    ];
    for (const [label, value, strong] of summary) {
      const y = doc.y;
      doc.font(strong ? B : R).fontSize(strong ? 10.5 : 9.5).text(label, left, y, { width: width * 0.7 });
      doc.text(`${value < 0 ? "−" : ""}${num(Math.abs(value))} ${ccy}`, left + width * 0.7, y, { width: width * 0.3, align: "right" });
      doc.y = y + (strong ? 16 : 14);
    }
    doc.x = left;
    doc.moveDown(0.6);

    const used = [...new Set(s.lines.flatMap((l) => l.remarks.map((r) => r.split(" ")[0])))];
    if (used.length) {
      doc.font(B).fontSize(9.5).text("Remark codes");
      doc.font(R).fontSize(8.5);
      for (const r of Object.values(REMARKS).filter((x) => used.includes(x.code))) doc.text(`${r.code}  ${r.text}`);
      doc.moveDown(0.5);
    }
    if (s.balanceBillingRisk > 0) {
      doc.font(B).fontSize(9).fillColor("#b45309").text(`The amount above the reference (${num(s.balanceBillingRisk)} ${ccy}) is being agreed with the provider; do not pay it if you are billed for it — contact us.`);
      doc.fillColor("#000000").moveDown(0.5);
    }
    doc.font(R).fontSize(8.5).fillColor("#555555").text(`Settled by rules ${s.ruleset} and approved by ${c.approvedBy}. Questions: claims@demo-assistance.example, quoting ${c.claimRef}.`);
    doc.end();
  });
}
