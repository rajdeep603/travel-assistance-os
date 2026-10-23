import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { BRAND, POWERED_BY } from "@/lib/brand";
import { formatPlainDate } from "@/lib/time";

// ---------------------------------------------------------------------------
// Renders a Letter of Guarantee PDF: English, with the labels and the
// guarantee sentence also in the hospital's language (Turkish, Spanish,
// French, Portuguese, German or Italian). Liberation Sans (shipped with
// pdfjs-dist, SIL OFL) is embedded so accented letters render; the page
// carries a DEMO watermark.
// ---------------------------------------------------------------------------

export type LetterLanguage = "tr" | "es" | "fr" | "pt" | "de" | "it";

/** The hospital's language for its letter, from its country; null when English alone is right. */
export function letterLanguageFor(country: string | null | undefined): LetterLanguage | null {
  const c = (country ?? "").toLowerCase();
  if (/turk/.test(c)) return "tr";
  if (/spain|mexico|dominican|argentin|colombia|chile|peru|costa rica|panama|cuba|ecuador|uruguay|venezuela/.test(c)) return "es";
  if (/france|tunisia|morocco|algeria|belgium|switzerland|senegal|ivory|côte|monaco|luxembourg/.test(c)) return "fr";
  if (/brazil|portugal/.test(c)) return "pt";
  if (/germany|austria/.test(c)) return "de";
  if (/italy/.test(c)) return "it";
  return null;
}

/** The second-language words on the letter. */
const LOCAL: Record<LetterLanguage, {
  subtitle: string;
  reference: string; date: string; validUntil: string; to: string; patient: string; policy: string; caseRef: string; treatment: string; admission: string;
  guaranteed: string; excess: string; conditions: string;
  confirm: (ref: string) => string;
}> = {
  tr: { subtitle: "Ödeme Taahhütnamesi (Garanti Mektubu)", reference: "Referans", date: "Tarih", validUntil: "Geçerlilik", to: "Kime", patient: "Hasta", policy: "Poliçe", caseRef: "Dosya No", treatment: "Tedavi", admission: "Yatış", guaranteed: "Taahhüt edilen tutar", excess: "Hasta katılım payı", conditions: "Koşullar", confirm: (ref) => `Yukarıda belirtilen tedavinin masraflarını, aşağıdaki koşullar ve ${ref} referanslı ayrıntılı son faturanın alınması şartıyla, taahhüt edilen tutara kadar ödeyeceğimizi teyit ederiz.` },
  es: { subtitle: "Garantía de pago (carta de garantía)", reference: "Referencia", date: "Fecha", validUntil: "Válida hasta", to: "Para", patient: "Paciente", policy: "Póliza", caseRef: "Expediente", treatment: "Tratamiento", admission: "Ingreso", guaranteed: "Importe garantizado", excess: "Franquicia del paciente", conditions: "Condiciones", confirm: (ref) => `Confirmamos que abonaremos los costes del tratamiento indicado hasta el importe garantizado, según las condiciones siguientes y previa recepción de la factura final detallada con la referencia ${ref}.` },
  fr: { subtitle: "Garantie de paiement (prise en charge)", reference: "Référence", date: "Date", validUntil: "Valable jusqu'au", to: "À", patient: "Patient", policy: "Police", caseRef: "Dossier", treatment: "Traitement", admission: "Admission", guaranteed: "Montant garanti", excess: "Franchise du patient", conditions: "Conditions", confirm: (ref) => `Nous confirmons prendre en charge les frais du traitement décrit ci-dessus jusqu'au montant garanti, selon les conditions ci-dessous et sur réception de la facture finale détaillée rappelant ${ref}.` },
  pt: { subtitle: "Garantia de pagamento (carta de garantia)", reference: "Referência", date: "Data", validUntil: "Válida até", to: "Para", patient: "Paciente", policy: "Apólice", caseRef: "Processo", treatment: "Tratamento", admission: "Internação", guaranteed: "Valor garantido", excess: "Franquia do paciente", conditions: "Condições", confirm: (ref) => `Confirmamos que pagaremos os custos do tratamento acima até o valor garantido, nas condições abaixo e mediante o recebimento da fatura final detalhada com a referência ${ref}.` },
  de: { subtitle: "Kostenübernahmeerklärung", reference: "Referenz", date: "Datum", validUntil: "Gültig bis", to: "An", patient: "Patient", policy: "Police", caseRef: "Fall", treatment: "Behandlung", admission: "Aufnahme", guaranteed: "Garantierter Betrag", excess: "Selbstbeteiligung", conditions: "Bedingungen", confirm: (ref) => `Wir bestätigen, die Kosten der oben genannten Behandlung bis zum garantierten Betrag zu übernehmen, gemäß den folgenden Bedingungen und nach Eingang der detaillierten Schlussrechnung mit der Referenz ${ref}.` },
  it: { subtitle: "Garanzia di pagamento (presa in carico)", reference: "Riferimento", date: "Data", validUntil: "Valida fino al", to: "A", patient: "Paziente", policy: "Polizza", caseRef: "Pratica", treatment: "Trattamento", admission: "Ricovero", guaranteed: "Importo garantito", excess: "Franchigia del paziente", conditions: "Condizioni", confirm: (ref) => `Confermiamo che saldaremo i costi del trattamento sopra indicato fino all'importo garantito, alle condizioni seguenti e alla ricezione della fattura finale dettagliata con il riferimento ${ref}.` },
};

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
  /** The hospital's language for the second set of labels; Turkish when unset, none when null. */
  lang?: LetterLanguage | null;
}

/** A font shipped with pdfjs-dist (Liberation Sans, SIL OFL), wherever node_modules ended up. */
export function fontPath(file: string): string | null {
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

    const local = c.lang === null ? null : LOCAL[c.lang ?? "tr"];
    doc.font(B).fontSize(16).text("LETTER OF GUARANTEE");
    if (local) doc.font(R).fontSize(11).fillColor("#555555").text(local.subtitle);
    else doc.fillColor("#555555");
    doc.moveDown(0.3);
    doc.fontSize(9).text(`${BRAND.name} · ${POWERED_BY} — demonstration build. Fictional data; this letter has no legal or financial effect.`);
    doc.fillColor("#000000").moveDown();

    const row = (label: string, other: string | undefined, value: string) => {
      doc.font(B).fontSize(10).text(`${other ? `${label} / ${other}` : label}: `, { continued: true }).font(R).text(value);
    };
    row("Reference", local?.reference, c.ref);
    row("Date", local?.date, formatPlainDate(c.issuedOn, { day: "numeric", month: "long", year: "numeric" }));
    row("Valid until", local?.validUntil, formatPlainDate(c.validUntil, { day: "numeric", month: "long", year: "numeric" }));
    doc.moveDown(0.6);

    doc.font(B).fontSize(11).text(local ? `To / ${local.to}` : "To");
    doc.font(R).fontSize(10).text(c.hospital.name);
    if (c.hospital.address) doc.text(c.hospital.address);
    const contact = [c.hospital.fax ? `Fax ${c.hospital.fax}` : null, c.hospital.email].filter(Boolean).join(" · ");
    if (contact) doc.text(contact);
    doc.moveDown(0.6);

    row("Patient", local?.patient, `${c.patient.name} (born ${c.patient.dateOfBirth}, ${c.patient.nationality})`);
    row("Policy", local?.policy, `${c.policy.number} — ${c.policy.plan} plan`);
    row("Our case", local?.caseRef, c.caseRef);
    row("Treatment", local?.treatment, c.treatment);
    if (c.admissionDate) row("Admission", local?.admission, c.admissionDate);
    doc.moveDown(0.6);

    doc.font(B).fontSize(12).text(`Guaranteed amount${local ? ` / ${local.guaranteed}` : ""}: ${money(c.guaranteedAmount, c.currency)}`);
    if (c.excess > 0) doc.font(R).fontSize(10).text(`Patient excess${local ? ` / ${local.excess}` : ""}: ${money(c.excess, c.currency)}`);
    doc.moveDown(0.4);
    doc
      .font(R)
      .fontSize(10)
      .text(
        `We confirm that we will settle the costs of the treatment described above up to the guaranteed amount, subject to the conditions below and to receipt of the final itemised invoice quoting ${c.ref}.`
      );
    if (local) doc.moveDown(0.3).fillColor("#444444").text(local.confirm(c.ref)).fillColor("#000000");
    doc.moveDown(0.6);

    doc.font(B).fontSize(11).text(local ? `Conditions / ${local.conditions}` : "Conditions");
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
