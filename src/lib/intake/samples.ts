import { createHash } from "node:crypto";
import scanText from "./scan-text.json";

// ---------------------------------------------------------------------------
// Fictional inbound samples for the Inbox demo: e-mails and faxes that run
// through the real intake pipeline ("Receive it", or importing the .eml/PDF
// from the sample library). The PDFs come from `npm run demo:samples`
// (scripts/samples/). Faxes are image-only scans; scan-text.json holds what
// is written on each, the offline provider's OCR ground truth for those
// files (the live model reads the image itself).
// ---------------------------------------------------------------------------

export interface EmailSample {
  id: string;
  label: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  /** Paths under public/. */
  attachments: string[];
}

export const EMAIL_SAMPLES: EmailSample[] = [
  {
    id: "claim-policy-number",
    label: "Claimant sends missing policy number + discharge summary",
    from: "Aylin Yilmaz <aylin.yilmaz@example.com>",
    to: "claims@inbound.demo-assistance.example",
    subject: "Re: Claim CLM-10245 — missing information",
    body:
      "Hello,\n\nAs requested, my policy number is POL-TR-100944. I have attached the discharge summary from the hospital.\n\nKind regards,\nAylin Yilmaz",
    attachments: ["demo-documents/discharge-summary-aylin-yilmaz.pdf"],
  },
  {
    id: "new-claim-bills",
    label: "Traveller e-mails medical bills (new claim)",
    from: "James Carter <james.carter@example.com>",
    to: "claims@inbound.demo-assistance.example",
    subject: "Medical bills from my trip to Istanbul",
    body:
      "Hi,\n\nI hurt my ankle in Istanbul and paid for treatment at the hospital. Please find the medical report and the invoice attached. How do I get reimbursed?\n\nThanks,\nJames Carter",
    attachments: ["demo-documents/medical-report-james-carter.pdf", "demo-documents/hospital-invoice-james-carter.pdf"],
  },
  {
    id: "hospital-epikriz-tr",
    label: "Hospital sends a Turkish discharge summary (epikriz)",
    from: "Marmara Demo Heart Center <international@demo-heart.example>",
    to: "medical@inbound.demo-assistance.example",
    subject: "Epikriz — Lena Koch (POL-TR-100946)",
    body:
      "Sayın yetkili,\n\nHastanız Lena Koch'un epikriz belgesini ekte bulabilirsiniz. Hasta 14 Ekim'de stabil olarak taburcu edilmiştir.\n\nSaygılarımızla,\nUluslararası Hasta Birimi",
    attachments: ["demo-inbound/epikriz-lena-koch.pdf"],
  },
  {
    id: "hospital-cost-estimate",
    label: "Hospital e-mails a cost estimate (needs a Letter of Guarantee)",
    from: "Marmara Demo Heart Center Billing <billing@demo-heart.example>",
    to: "medical@inbound.demo-assistance.example",
    subject: "Cost estimate / Maliyet tahmini — Oliver Bennett",
    body:
      "Dear colleagues,\n\nPlease find attached the cost estimate for your insured Oliver Bennett. We need a Letter of Guarantee before the angiography.\n\nBest regards,\nBilling Office",
    attachments: ["demo-inbound/cost-estimate-oliver-bennett.pdf"],
  },
  {
    id: "hospital-final-invoice",
    label: "Hospital bills the final invoice against a guarantee (overbilled)",
    from: "Marmara Demo Heart Center Billing <billing@demo-heart.example>",
    to: "medical@inbound.demo-assistance.example",
    subject: "Final invoice MHC-INV-2026-1342 — Lena Koch (LOG-0902)",
    body:
      "Dear colleagues,\n\nPlease find attached the final invoice for your insured Lena Koch (policy POL-TR-100946), admitted 12–14 October, for direct settlement under Letter of Guarantee LOG-0902.\n\nThe total of EUR 12,385.00 exceeds the guarantee; please confirm the additional amount.\n\nBest regards,\nBilling Office",
    attachments: ["demo-documents/final-invoice-lena-koch.pdf"],
  },
  {
    id: "traveller-status-es",
    label: "Traveller asks in Spanish: where is my case?",
    from: "Carlos Garcia <carlos.garcia@example.com>",
    to: "assistance@inbound.demo-assistance.example",
    subject: "¿En qué estado está mi caso?",
    body:
      "Hola:\n\nMe lesioné la rodilla en Beşiktaş y quería saber en qué estado está mi caso y si el hospital ya tiene la garantía de pago. También envié mi reclamación hace unos días.\n\nGracias,\nCarlos García\nPóliza POL-TR-100952",
    attachments: [],
  },
  {
    id: "traveller-status-de",
    label: "Traveller asks in German: where is my case?",
    from: "Lena Koch <lena.koch@example.com>",
    to: "assistance@inbound.demo-assistance.example",
    subject: "Stand meines Falls",
    body:
      "Guten Tag,\n\nich bin noch im Krankenhaus in Istanbul. Können Sie mir bitte sagen, wie der Stand meines Falls ist und wann ich nach Hause fliegen kann?\n\nVielen Dank\nLena Koch\nPolice POL-TR-100946",
    attachments: [],
  },
  {
    id: "hospital-gop-enquiry",
    label: "Hospital asks whether the guarantee was issued",
    from: "Marmara Demo Heart Center International <international@demo-heart.example>",
    to: "medical@inbound.demo-assistance.example",
    subject: "GOP status: Lena Koch (LOG-0902)",
    body:
      "Dear colleagues,\n\nCould you please confirm the status of the guarantee of payment for your insured Lena Koch (born 29.07.1964)? Our billing team cannot find the letter.\n\nBest regards,\nInternational Patients Desk",
    attachments: [],
  },
  // The booth's other regions.
  {
    id: "hospital-final-invoice-hurghada",
    label: "Red Sea hospital bills the final invoice and asks for a cash deposit",
    from: "Red Sea Demo Hospital Accounts <tourists@redsea-demo.example>",
    to: "medical@inbound.demo-assistance.example",
    subject: "Final invoice RSH-INV-2026-4418 — Hannah Becker (LOG-0905)",
    body:
      "Dear sirs,\n\nPlease find attached the final invoice for your insured Hannah Becker (policy POL-EG-300101), admitted 18–20 October, for direct settlement under LOG-0905.\n\nThe total of USD 7,405.00 is above your guarantee. Unless you confirm the difference today, the patient must pay a cash deposit of USD 3,000 before discharge.\n\nRegards,\nAccounts Department",
    attachments: ["demo-documents/final-invoice-hannah-becker-hurghada.pdf"],
  },
  {
    id: "clinic-invoice-punta-cana-es",
    label: "Caribbean clinic sends a Spanish report and its invoice in USD",
    from: "Clínica Demo Bávaro <internacional@bavaro-demo.example>",
    to: "medical@inbound.demo-assistance.example",
    subject: "Informe médico y factura — Sarah Whitfield (POL-DO-500101)",
    body:
      "Estimados señores:\n\nAdjuntamos el informe médico y la factura de su asegurada Sarah Whitfield, atendida el 20 de octubre por una fractura de muñeca. Les rogamos el pago por transferencia en dólares.\n\nSaludos cordiales,\nDepartamento Internacional",
    attachments: ["demo-documents/informe-medico-sarah-whitfield.pdf", "demo-documents/invoice-sarah-whitfield-punta-cana.pdf"],
  },
  {
    id: "clinic-discharge-sousse-fr",
    label: "Tunisian clinic sends a French discharge report and invoice in TND",
    from: "Clinique Demo Les Oliviers <international@oliviers-demo.example>",
    to: "medical@inbound.demo-assistance.example",
    subject: "Compte rendu et facture — Pierre Lambert (POL-TN-600101)",
    body:
      "Bonjour,\n\nVeuillez trouver ci-joint le compte rendu d'hospitalisation et la facture de votre assuré Pierre Lambert, sorti le 19 octobre. Merci de nous confirmer la prise en charge.\n\nBien cordialement,\nService des patients internationaux",
    attachments: ["demo-documents/compte-rendu-pierre-lambert-sousse.pdf", "demo-documents/facture-pierre-lambert-sousse.pdf"],
  },
  {
    id: "hospital-us-bill-florida",
    label: "US hospital sends an itemised statement (CPT codes)",
    from: "Atlantic Demo Medical Center PFS <pfs@atlantic-demo.example>",
    to: "claims@inbound.demo-assistance.example",
    subject: "Itemized statement ADMC-ACC-60412 — Robert Tremblay",
    body:
      "Hello,\n\nAttached is the itemized statement for Robert Tremblay (policy POL-CA-400101), admitted October 14–18. As an out-of-network facility we bill at standard rates; any balance not paid by the plan will be billed to the patient.\n\nPatient Financial Services",
    attachments: ["demo-documents/itemized-bill-robert-tremblay-florida.pdf"],
  },
  {
    id: "hospital-gop-enquiry-pt",
    label: "Brazilian hospital asks in Portuguese about its guarantee",
    from: "Copacabana Demo Hospital <internacional@copacabana-demo.example>",
    to: "medical@inbound.demo-assistance.example",
    subject: "Garantia de pagamento — Mia Andersson (LOG-0906)",
    body:
      "Prezados,\n\nPoderiam confirmar a garantia de pagamento da sua segurada Mia Andersson (nascida em 30/07/1994)? Nosso faturamento não encontra a carta.\n\nAtenciosamente,\nAtendimento Internacional",
    attachments: [],
  },
  {
    id: "complaint",
    label: "Upset traveller threatens legal action",
    from: "Marco Bianchi <marco.bianchi@example.com>",
    to: "claims@inbound.demo-assistance.example",
    subject: "Unacceptable — claim still not paid",
    body:
      "This is the third time I am writing. My dental claim CLM-10237 is still not paid. If I don't hear back this week I will contact my lawyer and file a formal complaint.\n\nMarco Bianchi, policy POL-TR-100948",
    attachments: [],
  },
];

/** A WhatsApp message to the assistance number, as Twilio delivers it. */
export interface WhatsAppSample {
  id: string;
  label: string;
  /** The sender's number (the traveller's own, when it should match their record). */
  from: string;
  body: string;
  /** Documents sent with it (paths under public/). */
  attachments: string[];
}

export const WHATSAPP_SAMPLES: WhatsAppSample[] = [
  {
    id: "wa-traveller-bill-punta-cana",
    label: "Traveller sends the clinic's bill on WhatsApp (Punta Cana)",
    from: "+44 7700 900963",
    body: "Hi, Sarah Whitfield here, policy POL-DO-500101. The clinic in Punta Cana gave me this bill for my wrist. Do I have to pay it before I fly home?",
    attachments: ["demo-documents/invoice-sarah-whitfield-punta-cana.pdf"],
  },
  {
    id: "wa-traveller-status-es",
    label: "Traveller asks in Spanish on WhatsApp: where is my case?",
    from: "+34 600 000 109",
    body: "Hola, soy Carlos García, póliza POL-TR-100952. ¿Me podéis decir en qué estado está mi caso y si el hospital ya tiene la garantía de pago? Gracias",
    attachments: [],
  },
  {
    id: "wa-hotel-hurghada",
    label: "Resort guest relations on WhatsApp (Hurghada, no case yet)",
    from: "+20 0000 4110",
    body: "Good evening, guest relations of a resort in Hurghada. Guest Jonas Weber, policy POL-EG-300188, came back from a dive with severe chest pain. The hospital asks for a cash deposit. Can you send a guarantee?",
    attachments: [],
  },
];

export interface FaxSample {
  id: string;
  label: string;
  from: string;
  to: string;
  /** Path under public/. */
  file: string;
}

export const FAX_SAMPLES: FaxSample[] = [
  {
    id: "fax-medical-report",
    label: "Handwritten medical report fax (Lena Koch)",
    from: "+902120002005",
    to: "+15550100198",
    file: "demo-inbound/fax-medical-report-lena-koch.pdf",
  },
  {
    id: "fax-cost-estimate",
    label: "Cost estimate fax (Oliver Bennett)",
    from: "+902120002005",
    to: "+15550100198",
    file: "demo-inbound/fax-cost-estimate-oliver-bennett.pdf",
  },
];

const SCANS = scanText as Record<string, { sha256: string; text: string }>;

/**
 * OCR ground truth for a bundled fax scan: matched by content, so a renamed
 * download still reads, or by file name ("fax-…-koch (1).pdf" included).
 */
export function sampleScanText(filename: string, buffer?: Buffer): string | null {
  if (buffer) {
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const hit = Object.values(SCANS).find((s) => s.sha256 === sha256);
    if (hit) return hit.text;
  }
  const base = (filename.split("/").pop() ?? filename).replace(/\s*\(\d+\)(?=\.pdf$)/i, "");
  return SCANS[base]?.text ?? null;
}
