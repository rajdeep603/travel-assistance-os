// ---------------------------------------------------------------------------
// Fictional inbound samples for the Inbox demo: e-mails and faxes that run
// through the real intake pipeline ("Simulate" buttons). PDFs live in
// public/demo-inbound/ (npm run demo:inbound). Faxes are image-only scans; the
// `lines` are what is written on them — the offline provider's OCR ground
// truth for these specific samples (the live model reads the image itself).
// ---------------------------------------------------------------------------

export interface InboundPdf {
  file: string;
  title: string;
  lines: string[];
  /** Rendered as an image-only fax scan (no text layer). */
  scanned?: boolean;
  /** Handwriting-style lettering on the scan. */
  handwritten?: boolean;
}

export const INBOUND_PDFS: InboundPdf[] = [
  {
    file: "cost-estimate-oliver-bennett.pdf",
    title: "Cost Estimate / Maliyet Tahmini — Marmara Demo Heart Center",
    lines: [
      "FICTIONAL DEMO DOCUMENT — FOR DEMONSTRATION ONLY",
      "",
      "COST ESTIMATE / MALİYET TAHMİNİ",
      "",
      "Hospital: Marmara Demo Heart Center",
      "Attending Physician: Dr. Baran Ozturk",
      "",
      "Patient Name: Oliver Bennett",
      "Date of Birth: 1956-12-05",
      "Policy Number: POL-TR-100950",
      "",
      "Diagnosis: Suspected unstable angina",
      "Planned Admission: 2026-10-15",
      "Planned Treatment: Coronary angiography; 3 nights cardiology ward; cardiac monitoring",
      "",
      "Estimated Total: 6,850.00 EUR",
      "Currency: EUR",
      "",
      "A Letter of Guarantee is required before the procedure.",
      "Please send the guarantee by fax to +90 212 000 2005 or e-mail billing@demo-heart.example.",
      "Signed: Billing Office",
    ],
  },
  {
    file: "epikriz-lena-koch.pdf",
    title: "Epikriz (Taburcu Özeti) — Marmara Demo Heart Center",
    lines: [
      "KURGUSAL DEMO BELGESİ — YALNIZCA GÖSTERİM AMAÇLIDIR",
      "",
      "EPİKRİZ",
      "",
      "Hastane: Marmara Demo Heart Center",
      "Sorumlu Hekim: Dr. Baran Ozturk",
      "",
      "Hasta Adı: Lena Koch",
      "Doğum Tarihi: 1964-07-29",
      "Poliçe No: POL-TR-100946",
      "",
      "Yatış Tarihi: 2026-10-12",
      "Taburcu Tarihi: 2026-10-14",
      "Şikayetler: göğüs ağrısı, nefes darlığı",
      "Tanı: Kararsız angina pektoris",
      "Yapılan İşlemler: Koroner anjiyografi, EKG takibi",
      "İlaçlar: Aspirin 100mg, Metoprolol 50mg",
      "",
      "Hasta stabil durumda taburcu edilmiştir. Uçuş öncesi kardiyoloji kontrolü önerilir.",
      "İmza: Dr. Baran Ozturk",
    ],
  },
  {
    file: "fax-medical-report-lena-koch.pdf",
    title: "Medical report (fax)",
    scanned: true,
    handwritten: true,
    lines: [
      "MARMARA DEMO HEART CENTER — FAX — FICTIONAL DEMO",
      "To: Travel Assistance Medical Desk",
      "",
      "Patient Name: Lena Koch",
      "Date of Birth: 1964-07-29",
      "Policy Number: POL-TR-100946",
      "Diagnosis: Unstable angina, stable after treatment",
      "Procedures: Coronary angiography",
      "Discharge Date: 2026-10-14",
      "Fit to fly: yes, with oxygen on request, after 2026-10-17",
      "Signed: Dr. B. Ozturk",
    ],
  },
  {
    file: "fax-cost-estimate-oliver-bennett.pdf",
    title: "Cost estimate (fax)",
    scanned: true,
    lines: [
      "MARMARA DEMO HEART CENTER — BILLING — FAX — FICTIONAL DEMO",
      "COST ESTIMATE",
      "",
      "Hospital: Marmara Demo Heart Center",
      "Patient Name: Oliver Bennett",
      "Date of Birth: 1956-12-05",
      "Policy Number: POL-TR-100950",
      "Diagnosis: Suspected unstable angina",
      "Planned Treatment: Coronary angiography; 3 nights cardiology ward",
      "Estimated Total: 6,850.00 EUR",
      "Letter of Guarantee required before the procedure.",
      "Signed: Billing Office",
    ],
  },
];

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

/** OCR ground truth for the scanned samples, by file name. */
export function sampleScanText(filename: string): string | null {
  const base = filename.split("/").pop() ?? filename;
  const pdf = INBOUND_PDFS.find((p) => p.scanned && p.file === base);
  return pdf ? pdf.lines.join("\n") : null;
}
