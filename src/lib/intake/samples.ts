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
