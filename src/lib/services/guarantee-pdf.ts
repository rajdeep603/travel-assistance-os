import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatPlainDate } from "@/lib/time";

// ---------------------------------------------------------------------------
// Renders a Letter of Guarantee PDF (English with Turkish labels for local
// hospitals). Liberation Sans (shipped with pdfjs-dist, SIL OFL) is embedded
// so Turkish letters render; the page carries a DEMO watermark.
// ---------------------------------------------------------------------------

export interface LetterContent {
  ref: string;
  issuedOn: string; // YYYY-MM-DD
  validUntil: string; // YYYY-MM-DD
  hospital: { name: string; address?: string | null; fax?: string | null; email?: string | null };
  patient: { name: string; dateOfBirth: string; nationality: string };
  policy: { number: string; plan: string };
  caseRef: string;
  treatment: string;
  admissionDate: string | null;
  guaranteedAmount: number;
  excess: number;
  currency: string;
  conditions: string[];
  approvedBy: string;
}

function fontPath(file: string): string | null {
  const candidates = [
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts", file),
    path.join(__dirname, "..", "node_modules", "pdfjs-dist", "standard_fonts", file),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

const money = (n: number, ccy: string) =>
  `${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`;

export function renderGuaranteeLetter(c: LetterContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `Letter of Guarantee ${c.ref}` } });
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

    // Watermark first, so the text sits on top of it.
    doc.save();
    doc.rotate(-35, { origin: [300, 420] });
    doc.font(B).fontSize(54).fillColor("#d9534f").opacity(0.12).text("DEMO — NOT A VALID GUARANTEE", 40, 400, { width: 560, align: "center" });
    doc.restore();
    doc.opacity(1).fillColor("#000000");
    // Drawing the watermark moved the text cursor; start the letter at the top margin.
    doc.x = doc.page.margins.left;
    doc.y = doc.page.margins.top;

    doc.font(B).fontSize(16).text("LETTER OF GUARANTEE");
    doc.font(R).fontSize(11).fillColor("#555555").text("Ödeme Taahhütnamesi (Garanti Mektubu)");
    doc.moveDown(0.3);
    doc.fontSize(9).text("Travel Assistance AI Platform — demonstration build. Fictional data; this letter has no legal or financial effect.");
    doc.fillColor("#000000").moveDown();

    const row = (label: string, tr: string, value: string) => {
      doc.font(B).fontSize(10).text(`${label} / ${tr}: `, { continued: true }).font(R).text(value);
    };
    row("Reference", "Referans", c.ref);
    row("Date", "Tarih", formatPlainDate(c.issuedOn, { day: "numeric", month: "long", year: "numeric" }));
    row("Valid until", "Geçerlilik", formatPlainDate(c.validUntil, { day: "numeric", month: "long", year: "numeric" }));
    doc.moveDown(0.6);

    doc.font(B).fontSize(11).text("To / Kime");
    doc.font(R).fontSize(10).text(c.hospital.name);
    if (c.hospital.address) doc.text(c.hospital.address);
    const contact = [c.hospital.fax ? `Fax ${c.hospital.fax}` : null, c.hospital.email].filter(Boolean).join(" · ");
    if (contact) doc.text(contact);
    doc.moveDown(0.6);

    row("Patient", "Hasta", `${c.patient.name} (born ${c.patient.dateOfBirth}, ${c.patient.nationality})`);
    row("Policy", "Poliçe", `${c.policy.number} — ${c.policy.plan} plan`);
    row("Our case", "Dosya No", c.caseRef);
    row("Treatment", "Tedavi", c.treatment);
    if (c.admissionDate) row("Admission", "Yatış", c.admissionDate);
    doc.moveDown(0.6);

    doc.font(B).fontSize(12).text(`Guaranteed amount / Taahhüt edilen tutar: ${money(c.guaranteedAmount, c.currency)}`);
    if (c.excess > 0) doc.font(R).fontSize(10).text(`Patient excess / Hasta katılım payı: ${money(c.excess, c.currency)}`);
    doc.moveDown(0.4);
    doc
      .font(R)
      .fontSize(10)
      .text(
        `We confirm that we will settle the costs of the treatment described above up to the guaranteed amount, subject to the conditions below and to receipt of the final itemised invoice quoting ${c.ref}.`
      );
    doc.moveDown(0.6);

    doc.font(B).fontSize(11).text("Conditions / Koşullar");
    doc.font(R).fontSize(10);
    for (const condition of c.conditions) doc.text(`• ${condition}`, { indent: 8 });
    doc.moveDown();

    doc.text("Please send the final invoice, medical report and discharge summary to medical@demo-assistance.example.");
    doc.moveDown();
    doc.font(B).text("Medical Assistance Desk");
    doc.font(R).fillColor("#555555").text(`Prepared by the AI assistance system · approved by ${c.approvedBy}`);
    doc.end();
  });
}
