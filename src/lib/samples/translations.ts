import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { EMAIL_SAMPLES, WHATSAPP_SAMPLES } from "@/lib/intake/samples";

// ---------------------------------------------------------------------------
// English versions of the bundled foreign-language samples, written by hand.
// The samples run on the offline rules (so rehearsed figures hold), and the
// offline glossary can't translate Arabic, nor a whole report well. These
// stand in for the live model's translation of those exact files and
// e-mails; anything else (a real upload, a real e-mail) is translated by the
// live model. ALL CONTENT IS FICTIONAL DEMO DATA.
// ---------------------------------------------------------------------------

interface SampleTranslation {
  /** Bundled files (under public/) this is the English version of. */
  files?: string[];
  /** Sample e-mails (EMAIL_SAMPLES ids): the subject and body, as the intake translates them. */
  emails?: string[];
  /** Sample WhatsApp messages (WHATSAPP_SAMPLES ids). */
  whatsapp?: string[];
  english: string;
}

const JEDDAH_REPORT_EN = `Al Shati Demo Hospital — Jeddah
Internal Medicine Department · International Patients Office
Corniche Road, Al Shati District, Jeddah 23511, Kingdom of Saudi Arabia
Tel: +966 12 000 2210 · E-mail: international@demo-alshati.example

MEDICAL REPORT
File No: SDH-2026-44817
Date: 2026-11-14

Patient details
Patient Name: Hasan Kılıç
Date of Birth: 1961-03-22
Nationality: Turkish
Insurer: Benefit Global Assistance
Policy Number: BGA-207733

Stay
Hospital: Al Shati Demo Hospital, Jeddah
Attending Physician: Dr Khaled Al-Omari, Consultant in Internal Medicine
Admission Date: 2026-11-11
Discharge Date: 2026-11-14
Room: 507

Medical summary
Diagnosis: Community-acquired pneumonia of the right lower lobe, with dehydration
Symptoms: fever of 39.2 °C; productive cough; shortness of breath; severe fatigue
Investigations: chest X-ray: right lower lobe infiltrate; white cell count 14,200; CRP 96 mg/L; oxygen saturation 93%
Procedures: intravenous ceftriaxone 2 g daily; intravenous azithromycin 500 mg; intravenous fluids; oxygen for 24 hours
Discharge medication: amoxicillin/clavulanic acid 1 g twice daily for 5 days

Course and recommendations
The patient was admitted through the emergency department after performing umrah, with fever and a cough for three days. His condition improved markedly on intravenous treatment; the fever settled after 48 hours and oxygen saturation rose to 97% on room air.
He was discharged in good general condition. Fit to fly on a commercial flight from 2026-11-16, without oxygen or a medical escort. A follow-up visit with a doctor in Türkiye is advised after one week, with a follow-up chest X-ray.

Attending physician: Dr Khaled Al-Omari
Signature and stamp: signed and stamped
Jeddah, 2026-11-14`;

const PARIS_REPORT_EN = `Clinique Démo des Batignolles
Visceral surgery · 24-hour emergency department · International patients
18 rue Démo des Batignolles, 75017 Paris, France

HOSPITAL REPORT
Hospital stay report · Visceral surgery
File No: CDB-2026-31877
Date: 2026-11-12

Patient
Patient Name: Elif Şahin
Date of Birth: 1990-07-08
Nationality: Turkish
Policy Number: BGA-318264
Insurer: Benefit Global Assistance
Sex: Female

Stay
Hospital: Clinique Démo des Batignolles
Attending Physician: Dr Camille Rousseau
Department: Visceral surgery
Admission Date: 2026-11-09
Discharge Date: 2026-11-12
Room: 318

Medical summary
Diagnosis: Acute uncomplicated appendicitis
Symptoms: right iliac fossa pain; nausea; fever of 38.4 °C
Procedures: abdominal CT scan; laparoscopic appendectomy on 2026-11-10
Discharge treatment: paracetamol 1 g three times a day for 5 days; wound care

Course
The patient was admitted through the emergency department on 9 November with abdominal pain that began the day before. The CT scan confirmed acute appendicitis without perforation. Laparoscopic appendectomy on 10 November, without complications.
Uneventful recovery; eating again on day 1. Discharged on 12 November in good general condition. Fit to fly on a commercial flight from 19 November. Stitches out and a check-up by a doctor in Türkiye on day 10.

Signature and stamp
Dr Camille Rousseau, Visceral surgery
Paris, 2026-11-12`;

const SAMPLE_TRANSLATIONS: SampleTranslation[] = [
  {
    whatsapp: ["wa-traveller-status-es"],
    english:
      "Hi, I'm Carlos García, policy POL-TR-100952. Can you tell me where my case stands and whether the hospital already has the guarantee of payment? Thanks",
  },
  { files: ["demo-documents/medical-report-ar-hasan-kilic-jeddah.pdf"], english: JEDDAH_REPORT_EN },
  { files: ["demo-documents/compte-rendu-elif-sahin-paris.pdf"], english: PARIS_REPORT_EN },
  {
    emails: ["benefit-arabic-report-jeddah"],
    english: `Medical report — Hasan Kılıç — BGA-207733

Dear Benefit Global Assistance,

Greetings.

Please find attached the medical report for the patient Hasan Kılıç, policy number BGA-207733, who was admitted to our hospital on 11 November with pneumonia. His condition is stable; he was discharged today and is fit to fly from 16 November.

Please confirm receipt of the report and send us a guarantee of payment covering the cost of his stay.

Kind regards,
International Patients Office
Al Shati Demo Hospital – Jeddah`,
  },
  {
    emails: ["benefit-french-report-paris"],
    english: `Hospital report — Elif Şahin (BGA-318264)

Dear Sir or Madam,

Please find attached the hospital report for your insured member, Ms Elif Şahin (policy BGA-318264), who was operated on for appendicitis on 10 November. She was discharged on 12 November in good condition.

Please confirm that you will cover the hospital costs, so that we can send you the final invoice.

Kind regards,
International Patients Department
Clinique Démo des Batignolles`,
  },
];

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const normalise = (text: string) => text.replace(/\s+/g, " ").trim();

/** The text the intake translates for an e-mail: its subject, then its body. */
export function messageText(subject: string | null | undefined, body: string | null | undefined): string {
  return [subject, body].filter(Boolean).join("\n\n");
}

let byFile: Promise<Map<string, string>> | null = null;

/** The hand-written English version of a bundled sample file, by content (a renamed upload still counts). */
export async function sampleFileTranslation(buffer: Buffer): Promise<string | null> {
  byFile ??= (async () => {
    const map = new Map<string, string>();
    for (const t of SAMPLE_TRANSLATIONS) {
      for (const rel of t.files ?? []) {
        const data = await fs.readFile(path.join(process.cwd(), "public", rel)).catch(() => null);
        if (data) map.set(sha256(data), t.english);
      }
    }
    return map;
  })();
  return (await byFile).get(sha256(buffer)) ?? null;
}

let byText: Map<string, string> | null = null;

/** The hand-written English version of a sample e-mail's text, ignoring whitespace. */
export function sampleTextTranslation(text: string): string | null {
  if (!byText) {
    byText = new Map();
    for (const t of SAMPLE_TRANSLATIONS) {
      for (const id of t.emails ?? []) {
        const s = EMAIL_SAMPLES.find((e) => e.id === id);
        if (s) byText.set(sha256(normalise(messageText(s.subject, s.body))), t.english);
      }
      for (const id of t.whatsapp ?? []) {
        const s = WHATSAPP_SAMPLES.find((w) => w.id === id);
        if (s) byText.set(sha256(normalise(s.body)), t.english);
      }
    }
  }
  return byText.get(sha256(normalise(text))) ?? null;
}
