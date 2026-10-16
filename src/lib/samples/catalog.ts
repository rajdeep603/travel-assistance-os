// ---------------------------------------------------------------------------
// The downloadable sample library: fictional documents, e-mails, faxes and
// assistance requests, grouped into kits next to the screen that reads them.
// Paths are under public/; the files come from `npm run demo:samples`.
// Client-safe: no Node imports.
// ---------------------------------------------------------------------------

export type SampleSection = "documents" | "claims" | "inbox" | "intake";

export interface SampleFile {
  /** Under public/. */
  path: string;
  title: string;
  note: string;
  /** For e-mails: the EMAIL_SAMPLES entry it is built from, and when it was sent. */
  email?: { sample: string; sentAt: string };
}

export interface SampleKit {
  id: string;
  section: SampleSection;
  title: string;
  description: string;
  files: SampleFile[];
}

const doc = (file: string) => `demo-documents/${file}`;
const inbound = (file: string) => `demo-inbound/${file}`;

export const SAMPLE_KITS: SampleKit[] = [
  {
    id: "documents",
    section: "documents",
    title: "Medical documents",
    description: "One of each kind the AI reads. Download one, then upload it above.",
    files: [
      { path: doc("medical-report-aylin-yilmaz.pdf"), title: "Medical report", note: "Aylin Yilmaz · gastroenteritis · lab results" },
      { path: doc("discharge-summary-lena-koch.pdf"), title: "Discharge summary", note: "Lena Koch · unstable angina" },
      { path: doc("hospital-invoice-aylin-yilmaz.pdf"), title: "Hospital invoice", note: "25,250 TRY · itemised, paid stamp" },
      { path: doc("prescription-aylin-yilmaz.pdf"), title: "Prescription", note: "Two medicines, with directions" },
      { path: doc("medical-report-james-carter.pdf"), title: "Unsigned report", note: "James Carter · no signature or policy number to find" },
      { path: doc("cost-estimate-carlos-garcia.pdf"), title: "Cost estimate", note: "Carlos Garcia · knee surgery · open CASE-1015 first to prepare a guarantee" },
      { path: inbound("epikriz-lena-koch.pdf"), title: "Turkish discharge summary", note: "Epikriz · translated to English" },
      { path: inbound("fax-medical-report-lena-koch.pdf"), title: "Handwritten fax", note: "Image only · read with OCR" },
    ],
  },
  {
    id: "claim-aylin",
    section: "claims",
    title: "Complete claim pack",
    description: "Aylin Yilmaz (PAT-1001). Every document a claim needs, including the policy number.",
    files: [
      { path: doc("medical-report-aylin-yilmaz.pdf"), title: "Medical report", note: "Gastroenteritis, 2 nights" },
      { path: doc("hospital-invoice-aylin-yilmaz.pdf"), title: "Hospital invoice", note: "25,250 TRY" },
      { path: doc("discharge-summary-aylin-yilmaz.pdf"), title: "Discharge summary", note: "Signed and stamped" },
      { path: doc("prescription-aylin-yilmaz.pdf"), title: "Prescription", note: "Carries the policy number" },
    ],
  },
  {
    id: "claim-james",
    section: "claims",
    title: "Pack with gaps",
    description: "James Carter (PAT-1002). Report and invoice only, so the review asks for the discharge summary and policy number.",
    files: [
      { path: doc("medical-report-james-carter.pdf"), title: "Medical report", note: "Ankle fracture · unsigned" },
      { path: doc("hospital-invoice-james-carter.pdf"), title: "Hospital invoice", note: "800 EUR, paid by card" },
    ],
  },
  {
    id: "claim-lena",
    section: "claims",
    title: "Cardiac claim",
    description: "Lena Koch (PAT-1003). Emergency report, discharge summary and an invoice billed to the insurer.",
    files: [
      { path: doc("emergency-report-lena-koch.pdf"), title: "Emergency report", note: "Chest pain, ruled out heart attack" },
      { path: doc("discharge-summary-lena-koch.pdf"), title: "Discharge summary", note: "2 nights, cardiology" },
      { path: doc("hospital-invoice-lena-koch.pdf"), title: "Hospital invoice", note: "4,060 EUR due" },
    ],
  },
  {
    id: "inbox-emails",
    section: "inbox",
    title: "E-mails",
    description: "Real .eml files with their attachments. Open one in any mail app, or import it here.",
    files: [
      {
        path: "samples/inbox/aylin-yilmaz-missing-policy-number.eml",
        title: "Claimant replies with her policy number",
        note: "Aylin Yilmaz · discharge summary attached · matches CLM-10245",
        email: { sample: "claim-policy-number", sentAt: "2026-10-15T09:14:00+01:00" },
      },
      {
        path: "samples/inbox/james-carter-medical-bills.eml",
        title: "Traveller sends medical bills",
        note: "James Carter · report and invoice attached",
        email: { sample: "new-claim-bills", sentAt: "2026-10-15T18:42:00-04:00" },
      },
      {
        path: "samples/inbox/marmara-epikriz-lena-koch.eml",
        title: "Hospital sends a Turkish epikriz",
        note: "Marmara Demo Heart Center · in Turkish",
        email: { sample: "hospital-epikriz-tr", sentAt: "2026-10-14T16:20:00+03:00" },
      },
      {
        path: "samples/inbox/marmara-cost-estimate-oliver-bennett.eml",
        title: "Hospital asks for a guarantee",
        note: "Cost estimate attached · starts a Letter of Guarantee",
        email: { sample: "hospital-cost-estimate", sentAt: "2026-10-15T09:35:00+03:00" },
      },
      {
        path: "samples/inbox/marco-bianchi-complaint.eml",
        title: "Upset traveller",
        note: "Threatens legal action · held for a person",
        email: { sample: "complaint", sentAt: "2026-10-16T11:02:00+02:00" },
      },
    ],
  },
  {
    id: "inbox-faxes",
    section: "inbox",
    title: "Faxes",
    description: "Image-only scans, as a fax machine delivers them. Import one here; OCR reads it.",
    files: [
      { path: inbound("fax-cost-estimate-oliver-bennett.pdf"), title: "Cost estimate fax", note: "Oliver Bennett · 6,850 EUR" },
      { path: inbound("fax-medical-report-lena-koch.pdf"), title: "Handwritten medical fax", note: "Lena Koch · fit to fly" },
    ],
  },
  {
    id: "intake-requests",
    section: "intake",
    title: "Assistance requests",
    description: "Call notes, a WhatsApp chat and e-mails as plain text. Load one into the request box.",
    files: [
      { path: "samples/intake/call-note-taksim-stomach-pain.txt", title: "Call note", note: "Stomach pain near Taksim · high urgency" },
      { path: "samples/intake/whatsapp-kadikoy-child-fever.txt", title: "WhatsApp chat", note: "Child with fever in Kadıköy" },
      { path: "samples/intake/email-hotel-sultanahmet-toothache.txt", title: "Hotel e-mail", note: "Guest with toothache · dental" },
      { path: "samples/intake/email-tour-operator-case-1013.txt", title: "Tour operator follow-up", note: "Quotes an existing case" },
      { path: "samples/intake/call-transcript-sisli-chest-pain.txt", title: "Emergency call", note: "Chest pain in Şişli · critical" },
    ],
  },
];

export function kitsFor(section: SampleSection): SampleKit[] {
  return SAMPLE_KITS.filter((k) => k.section === section);
}

export function sampleKit(id: string): SampleKit | null {
  return SAMPLE_KITS.find((k) => k.id === id) ?? null;
}

export const fileName = (path: string) => path.split("/").pop() ?? path;

export const fileType = (path: string) => (path.split(".").pop() ?? "").toUpperCase();

/** Every distinct file in the library. */
export function allSampleFiles(): SampleFile[] {
  const seen = new Map<string, SampleFile>();
  for (const kit of SAMPLE_KITS) for (const f of kit.files) if (!seen.has(f.path)) seen.set(f.path, f);
  return [...seen.values()];
}
