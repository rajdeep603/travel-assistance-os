import PDFDocument from "pdfkit";
import { BRAND, POWERED_BY } from "@/lib/brand";
import { fontPath } from "./guarantee-pdf";
import { MODE_LABELS, type TransportAssessment, type TransportModeCode } from "./transport";

// ---------------------------------------------------------------------------
// The airline's medical information form (MEDIF), pre-filled from the treating
// doctor's assessment, for a stretcher or an escorted seat on a scheduled
// flight. The doctor checks and signs it; the airline's medical desk clears
// the passenger. Laid out after the IATA form's sections; DEMO watermark.
// ---------------------------------------------------------------------------

export interface MedifContent {
  planRef: string;
  caseRef: string;
  issuedOn: string;
  passenger: { name: string; dateOfBirth: string; nationality: string };
  from: string;
  to: string;
  mode: TransportModeCode;
  assessment: TransportAssessment;
  treatingPhysician: string | null;
}

const yesNo = (b: boolean) => (b ? "Yes" : "No");

export function renderMedif(c: MedifContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `MEDIF ${c.planRef}` } });
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
    const a = c.assessment;
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    doc.save();
    doc.rotate(-35, { origin: [300, 420] });
    doc.font(B).fontSize(50).fillColor("#d9534f").opacity(0.1).text("DEMO — FICTIONAL DATA", 40, 400, { width: 560, align: "center" });
    doc.restore();
    doc.opacity(1).fillColor("#000000");
    doc.x = left;
    doc.y = doc.page.margins.top;

    doc.font(B).fontSize(16).text("MEDICAL INFORMATION FORM (MEDIF)");
    doc.font(R).fontSize(9).fillColor("#555555").text(`For airline medical clearance · prepared by ${BRAND.name} (${POWERED_BY}) from the treating doctor's assessment. Demonstration: fictional data.`);
    doc.fillColor("#000000").moveDown(0.8);

    const section = (title: string) => {
      doc.moveDown(0.4);
      const y = doc.y;
      doc.rect(left, y, width, 16).fill("#eef2ff");
      doc.fillColor("#1e293b").font(B).fontSize(9.5).text(title, left + 6, y + 3.5);
      doc.fillColor("#000000");
      doc.x = left;
      doc.y = y + 22;
    };
    const field = (label: string, value: string) => {
      const y = doc.y;
      doc.font(R).fontSize(9).fillColor("#555555").text(label, left, y, { width: width * 0.42 });
      doc.font(B).fillColor("#000000").text(value, left + width * 0.42, y, { width: width * 0.58 });
      doc.x = left;
      doc.y = Math.max(doc.y, y + 13) + 2;
    };

    section("Part 1 · Passenger and journey");
    field("Passenger", c.passenger.name);
    field("Date of birth · nationality", `${c.passenger.dateOfBirth} · ${c.passenger.nationality}`);
    field("Journey", `${c.from} → ${c.to}`);
    field("Requested service", MODE_LABELS[c.mode]);
    field("Our references", `${c.planRef} · ${c.caseRef}`);

    section("Part 2 · Medical information (treating physician)");
    field("Diagnosis", a.diagnosis);
    field("Fit to travel", a.fitToFly ? (a.fitFrom ? `Yes, from ${a.fitFrom}` : "Yes") : `Not yet${a.fitFrom ? ` (expected ${a.fitFrom})` : ""}`);
    field("Mobility", a.mobility === "STRETCHER" ? "Stretcher (lying flat)" : a.mobility === "WHEELCHAIR" ? "Wheelchair to the aircraft seat (WCHC)" : "Walks unaided");
    field("Supplemental oxygen in flight", a.oxygenLpm ? `${a.oxygenLpm} L/min, continuous` : "No");
    field("Monitoring or IV in flight", a.monitoring === "NONE" ? "No" : a.monitoring === "CONTINUOUS" ? "Continuous monitoring" : "Basic observations");
    field("Medical escort", a.escort === "NONE" ? "None needed" : a.escort === "DOCTOR" ? "Doctor" : "Nurse");
    field("Intensive care needed", yesNo(!!a.intensiveCare));
    if (a.notes) field("Notes", a.notes);

    section("Part 3 · Special handling");
    field("Stretcher seats blocked", a.mobility === "STRETCHER" ? "Yes: airline stretcher, curtained" : "No");
    field("Ambulance at departure and arrival", a.mobility === "SEATED" ? "No" : "Yes, airside");
    field("Medical equipment on board", [a.oxygenLpm ? "Oxygen concentrator (airline-approved)" : null, a.monitoring !== "NONE" ? "Portable monitor" : null].filter(Boolean).join(", ") || "None");

    doc.moveDown(1.2);
    doc.font(R).fontSize(9.5).text(`Treating physician: ${c.treatingPhysician ?? "________________________"}`);
    doc.moveDown(0.6);
    doc.text("Signature and stamp: ______________________________      Date: ______________");
    doc.moveDown(1);
    doc.font(R).fontSize(8.5).fillColor("#555555").text(`Prepared ${c.issuedOn}. The doctor checks every field before signing; the airline's medical desk decides on clearance.`);
    doc.end();
  });
}
