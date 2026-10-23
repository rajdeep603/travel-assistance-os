import { BRAND } from "../../src/lib/brand";
import type { Block, Column, Field, SampleDoc } from "./model";
import {
  ATLANTIC_MEDICAL,
  BAVARO_CLINIC,
  JUMEIRAH_HOSPITAL,
  LEMAN_CLINIC,
  OLIVIERS_CLINIC,
  RED_SEA_HOSPITAL,
  SARANDA_POLYCLINIC,
  certifiedCopy,
  copiaFiel,
  copieConforme,
  facturation,
  patientAccounts,
} from "./issuers";

// ---------------------------------------------------------------------------
// Sample documents for the booth's other regions: an overbilled resort
// hospital on the Red Sea, a Caribbean clinic's Spanish report and invoice,
// a Tunisian clinic's French discharge report and invoice, a US hospital's
// itemised statement with CPT codes, and invoices from Albania, Dubai and
// Geneva in their own currencies. People, policies and cases match
// prisma/seed-data.ts. ALL CONTENT IS FICTIONAL DEMO DATA.
// ---------------------------------------------------------------------------

const fields = (name: string, dob: string, nationality: string): Field[] => [
  ["Patient Name:", name],
  ["Date of Birth:", dob],
  ["Nationality:", nationality],
];

const HANNAH = fields("Hannah Becker", "1983-05-09", "Germany");
const ROBERT = fields("Robert Tremblay", "1954-01-22", "Canada");
const MATTEO = fields("Matteo Ferraro", "1996-09-03", "Italy");
const THANDIWE = fields("Thandiwe Nkosi", "1985-12-14", "South Africa");
const KHALID = fields("Khalid Al Suwaidi", "1979-04-18", "United Arab Emirates");

const patient = (left: Field[], right: Field[], title = "Patient"): Block => ({ type: "fields", title, left, right, split: 0.55 });

const columns = (labels: [string, string, string, string, string]): Column[] => [
  { label: labels[0], width: 0.12 },
  { label: labels[1], width: 0.46 },
  { label: labels[2], width: 0.08, align: "right" },
  { label: labels[3], width: 0.16, align: "right" },
  { label: labels[4], width: 0.18, align: "right" },
];
const MONEY = columns(["Code", "Description", "Qty", "Unit price", "Amount"]);
const MONEY_FR = columns(["Code", "Désignation", "Qté", "Prix unitaire", "Montant"]);

type Charge = [code: string, description: string, quantity: number, unitPrice: number];

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Table rows and the total, computed so the arithmetic on every sample is right. */
function charges(lines: Charge[]): { rows: string[][]; total: string } {
  const rows = lines.map(([code, description, q, unit]) => [code, description, String(q), fmt(unit), fmt(q * unit)]);
  return { rows, total: fmt(lines.reduce((s, [, , q, unit]) => s + q * unit, 0)) };
}

// --- Hannah Becker: gastroenteritis in Hurghada, overbilled (CASE-1001) ------
// Two nights billed as four, a VIP suite, a duplicated lab line, a minibar and
// prices well above the reference, with a cash deposit demanded at discharge.

const hannahCharges = charges([
  ["520.030", "Emergency department admission", 1, 450],
  ["510.120", "Ward accommodation (per night)", 4, 690],
  ["510.160", "VIP suite supplement (per night)", 4, 250],
  ["520.080", "Physician fees, daily rounds", 4, 220],
  ["901.010", "Laboratory: blood count, CRP, electrolytes", 3, 140],
  ["901.010", "Laboratory: blood count, CRP, electrolytes", 3, 140],
  ["901.430", "Laboratory: stool culture", 1, 95],
  ["600.300", "Intravenous rehydration (per day)", 3, 180],
  ["600.200", "Medication and consumables", 1, 680],
  ["950.920", "Minibar and guest meals", 1, 160],
]);

const hannahFinalInvoice: SampleDoc = {
  file: "final-invoice-hannah-becker-hurghada.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: RED_SEA_HOSPITAL,
  title: "INVOICE",
  subtitle: "Final invoice, inpatient stay",
  meta: [
    ["Invoice No:", "RSH-INV-2026-4418"],
    ["Invoice Date:", "2026-10-20"],
    ["Case:", "CASE-1001"],
  ],
  blocks: [
    patient(HANNAH, [
      ["Policy Number:", "POL-EG-300101"],
      ["Payer:", `${BRAND.name} (direct billing)`],
      ["Currency:", "USD"],
    ]),
    {
      type: "fields",
      title: "Stay",
      left: [
        ["Hospital:", "Red Sea Demo Hospital"],
        ["Attending Physician:", "Dr. Karim Mansour"],
        ["Diagnosis:", "Gastroenteritis with dehydration (A09)"],
      ],
      right: [
        ["Admission Date:", "2026-10-18"],
        ["Discharge Date:", "2026-10-20"],
        ["Room:", "VIP 204"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "table",
      heading: "Itemised charges",
      columns: MONEY,
      rows: hannahCharges.rows,
      totals: [
        { label: "Subtotal:", value: hannahCharges.total },
        { label: "Total Amount Due:", value: `${hannahCharges.total} USD`, strong: true },
      ],
      note: "Tourist patients: a cash deposit of USD 3,000 is required before discharge unless a guarantee of payment is received.",
    },
    {
      type: "signature",
      caption: "Billing office stamp",
      name: "Accounts Department",
      role: "Tourist Medical Services",
      place: "Hurghada, 2026-10-20",
      stamp: patientAccounts(RED_SEA_HOSPITAL),
    },
  ],
};

// --- Sarah Whitfield: wrist fracture in Punta Cana (CASE-1002) ---------------
// A Spanish medical report (read and translated to English) and the clinic's
// invoice in US dollars, billed to the assistance company.

const sarahReportEs: SampleDoc = {
  file: "informe-medico-sarah-whitfield.pdf",
  dir: "demo-documents",
  lang: "es",
  issuer: BAVARO_CLINIC,
  title: "INFORME MÉDICO",
  subtitle: "Urgencias · Traumatología",
  meta: [
    ["Informe N.º:", "CDB-IM-2026-0931"],
    ["Fecha:", "2026-10-20"],
  ],
  blocks: [
    {
      type: "fields",
      title: "Paciente",
      left: [
        ["Paciente:", "Sarah Whitfield"],
        ["Fecha de nacimiento:", "1990-06-25"],
        ["Nacionalidad:", "Reino Unido"],
      ],
      right: [
        ["Número de póliza:", "POL-DO-500101"],
        ["Sexo:", "Femenino"],
        ["Hotel:", "Resort Bávaro"],
      ],
      split: 0.55,
      labelWidth: 112,
    },
    {
      type: "fields",
      title: "Atención",
      left: [
        ["Clínica:", "Clínica Demo Bávaro"],
        ["Médico tratante:", "Dra. Carolina Peña"],
        ["Fecha de ingreso:", "2026-10-20"],
      ],
      right: [
        ["Servicio:", "Urgencias"],
        ["Llegada:", "Taxi del hotel"],
        ["Hora:", "16:40"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "section",
      heading: "Evaluación clínica",
      labelWidth: 112,
      fields: [
        ["Diagnóstico:", "Fractura de radio distal izquierdo, no desplazada"],
        ["Síntomas:", "dolor intenso; inflamación; deformidad leve de la muñeca izquierda"],
        ["Procedimientos:", "Radiografía de muñeca; inmovilización con férula de yeso"],
        ["Medicamentos:", "Ibuprofeno 400 mg cada 8 horas; Paracetamol 1 g si hay dolor"],
      ],
    },
    {
      type: "section",
      heading: "Plan",
      text: [
        "La paciente sufrió una caída en la piscina del hotel. La radiografía confirma una fractura no desplazada del radio distal izquierdo. Se coloca férula de yeso por debajo del codo.",
        "Control en consulta de traumatología en 7 días. Puede viajar en vuelo comercial con la férula; se recomienda asistencia en el aeropuerto.",
      ],
    },
    {
      type: "signature",
      caption: "Firma y sello",
      name: "Dra. Carolina Peña",
      role: "Traumatología y Urgencias",
      place: "Punta Cana, 2026-10-20",
      stamp: copiaFiel(BAVARO_CLINIC),
    },
  ],
};

const sarahCharges = charges([
  ["520.010", "Emergency consultation", 1, 280],
  ["801.240", "X-ray, wrist (2 views)", 1, 240],
  ["612.050", "Below-elbow cast", 1, 450],
  ["950.130", "Arm sling", 1, 35],
  ["600.100", "Medication", 1, 85],
  ["520.020", "Specialist consultation, orthopaedics", 1, 180],
]);

const sarahInvoice: SampleDoc = {
  file: "invoice-sarah-whitfield-punta-cana.pdf",
  dir: "demo-documents",
  lang: "es",
  issuer: BAVARO_CLINIC,
  title: "FACTURA / INVOICE",
  subtitle: "Outpatient emergency care · direct billing",
  meta: [
    ["Invoice No:", "CDB-FAC-2026-2207"],
    ["Invoice Date:", "2026-10-21"],
    ["Case:", "CASE-1002"],
  ],
  blocks: [
    patient(fields("Sarah Whitfield", "1990-06-25", "United Kingdom"), [
      ["Policy Number:", "POL-DO-500101"],
      ["Payer:", `${BRAND.name} (direct billing)`],
      ["Currency:", "USD"],
    ]),
    {
      type: "fields",
      title: "Visit",
      left: [
        ["Clinic:", "Clínica Demo Bávaro"],
        ["Attending Physician:", "Dra. Carolina Peña"],
        ["Diagnosis:", "Distal radius fracture, left (S52.5)"],
      ],
      right: [
        ["Visit Date:", "2026-10-20"],
        ["Guarantee:", "By e-mail"],
        ["Terms:", "30 days"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "table",
      heading: "Charges",
      columns: MONEY,
      rows: sarahCharges.rows,
      totals: [{ label: "Total Amount Due:", value: `${sarahCharges.total} USD`, strong: true }],
      note: "Payment by bank transfer in US dollars. Please quote the invoice number.",
    },
    {
      type: "signature",
      caption: "Sello de facturación",
      name: "Departamento Internacional",
      role: "Facturación a aseguradoras",
      place: "Punta Cana, 2026-10-21",
      stamp: copiaFiel(BAVARO_CLINIC),
    },
  ],
};

// --- Pierre Lambert: pyelonephritis in Sousse (CASE-1003) --------------------
// A French discharge report (translated to English) and a French invoice in
// Tunisian dinars: one night too many, a duplicated lab line, comfort items.

const pierreDischargeFr: SampleDoc = {
  file: "compte-rendu-pierre-lambert-sousse.pdf",
  dir: "demo-documents",
  lang: "fr",
  issuer: OLIVIERS_CLINIC,
  title: "COMPTE RENDU",
  subtitle: "Compte rendu d'hospitalisation · Médecine interne",
  meta: [
    ["N° dossier:", "CLO-2026-07714"],
    ["Date:", "2026-10-19"],
  ],
  blocks: [
    {
      type: "fields",
      title: "Patient",
      left: [
        ["Nom du patient:", "Pierre Lambert"],
        ["Date de naissance:", "1958-02-11"],
        ["Nationalité:", "France"],
      ],
      right: [
        ["Numéro de police:", "POL-TN-600101"],
        ["Sexe:", "Masculin"],
        ["Hôtel:", "Kantaoui"],
      ],
      split: 0.55,
      labelWidth: 108,
    },
    {
      type: "fields",
      title: "Séjour",
      left: [
        ["Établissement:", "Clinique Demo Les Oliviers"],
        ["Médecin traitant:", "Dr Sami Ben Salah"],
        ["Service:", "Médecine interne"],
      ],
      right: [
        ["Date d'admission:", "2026-10-16"],
        ["Date de sortie:", "2026-10-19"],
        ["Chambre:", "212"],
      ],
      split: 0.6,
      labelWidth: 104,
    },
    {
      type: "section",
      heading: "Synthèse médicale",
      labelWidth: 108,
      fields: [
        ["Diagnostic:", "Pyélonéphrite aiguë droite"],
        ["Symptômes:", "fièvre à 39,5 °C; douleur lombaire droite; brûlures mictionnelles"],
        ["Actes réalisés:", "Échographie rénale; hémocultures; antibiothérapie intraveineuse"],
        ["Traitement de sortie:", "Ciprofloxacine 500 mg deux fois par jour pendant 10 jours"],
      ],
    },
    {
      type: "section",
      heading: "Évolution",
      text: [
        "Patient admis par les urgences pour fièvre et douleur lombaire droite. L'échographie rénale ne montre pas d'obstacle. Évolution favorable sous antibiothérapie intraveineuse, apyrexie à 48 heures.",
        "Sortie en bon état général. Apte au voyage en vol commercial à partir du 21 octobre. Contrôle par le médecin traitant au retour en France.",
      ],
    },
    {
      type: "signature",
      caption: "Signature et cachet",
      name: "Dr Sami Ben Salah",
      role: "Médecine interne",
      place: "Sousse, 2026-10-19",
      stamp: copieConforme(OLIVIERS_CLINIC, "Sousse"),
    },
  ],
};

const pierreCharges = charges([
  ["520.030", "Admission aux urgences", 1, 520],
  ["510.120", "Hospitalisation, chambre (par nuit)", 4, 1350],
  ["510.160", "Supplément chambre individuelle (par nuit)", 4, 280],
  ["802.050", "Échographie rénale", 1, 260],
  ["901.060", "Hémocultures et ECBU", 1, 210],
  ["901.010", "Bilan sanguin: NFS, CRP, ionogramme", 3, 180],
  ["901.010", "Bilan sanguin: NFS, CRP, ionogramme", 3, 180],
  ["600.200", "Médicaments et consommables", 1, 1180],
  ["520.080", "Honoraires médicaux, visites quotidiennes", 4, 300],
  ["950.900", "Téléphone et télévision", 1, 60],
]);

const pierreInvoiceFr: SampleDoc = {
  file: "facture-pierre-lambert-sousse.pdf",
  dir: "demo-documents",
  lang: "fr",
  issuer: OLIVIERS_CLINIC,
  title: "FACTURE",
  subtitle: "Facture définitive · hospitalisation",
  meta: [
    ["Facture N°:", "CLO-FAC-2026-3381"],
    ["Date:", "2026-10-19"],
    ["Dossier:", "CASE-1003"],
  ],
  blocks: [
    {
      type: "fields",
      title: "Patient",
      left: [
        ["Patient:", "Pierre Lambert"],
        ["Date de naissance:", "1958-02-11"],
        ["Nationalité:", "France"],
      ],
      right: [
        ["Numéro de police:", "POL-TN-600101"],
        ["Payeur:", `${BRAND.name} (tiers payant)`],
        ["Devise:", "TND"],
      ],
      split: 0.55,
      labelWidth: 100,
    },
    {
      type: "fields",
      title: "Séjour",
      left: [
        ["Établissement:", "Clinique Demo Les Oliviers"],
        ["Médecin traitant:", "Dr Sami Ben Salah"],
        ["Diagnostic:", "Pyélonéphrite aiguë droite (N10)"],
      ],
      right: [
        ["Date d'admission:", "2026-10-16"],
        ["Date de sortie:", "2026-10-19"],
        ["Chambre:", "212"],
      ],
      split: 0.6,
      labelWidth: 104,
    },
    {
      type: "table",
      heading: "Détail des prestations",
      columns: MONEY_FR,
      rows: pierreCharges.rows,
      totals: [{ label: "Montant total:", value: `${pierreCharges.total} TND`, strong: true }],
      note: "Règlement par virement sous 30 jours. Merci de rappeler le numéro de facture.",
    },
    {
      type: "signature",
      caption: "Cachet du service facturation",
      name: "Service Facturation",
      role: "Patients internationaux",
      place: "Sousse, 2026-10-19",
      stamp: facturation(OLIVIERS_CLINIC),
    },
  ],
};

// --- Robert Tremblay: pneumonia in Fort Lauderdale (CASE-1004) ---------------
// A US hospital's itemised statement at chargemaster prices, with CPT and
// revenue codes: five room days for a four-night stay, a television.

const robertCharges = charges([
  ["99285", "Emergency department visit, high complexity", 1, 3850],
  ["71046", "Chest X-ray, 2 views", 2, 640],
  ["85025", "Complete blood count (CBC)", 4, 210],
  ["80053", "Comprehensive metabolic panel", 4, 380],
  ["87040", "Blood culture", 2, 450],
  ["0120", "Room and board, semi-private (per day)", 5, 4200],
  ["99223", "Initial hospital care, high complexity", 1, 980],
  ["99233", "Subsequent hospital care (per day)", 4, 520],
  ["94640", "Nebulizer treatment", 8, 185],
  ["J0696", "Ceftriaxone injection, 250 mg", 5, 120],
  ["0990", "Patient convenience: television", 5, 25],
]);

const robertUsBill: SampleDoc = {
  file: "itemized-bill-robert-tremblay-florida.pdf",
  dir: "demo-documents",
  lang: "en",
  seed: { kind: "HOSPITAL_INVOICE", patientRef: "PAT-0962", caseRef: "CASE-1004", claimRef: "CLM-10230" },
  issuer: ATLANTIC_MEDICAL,
  title: "ITEMIZED STATEMENT",
  subtitle: "Hospital invoice, inpatient account",
  meta: [
    ["Account No:", "ADMC-ACC-60412"],
    ["Statement Date:", "2026-10-19"],
    ["Case:", "CASE-1004"],
  ],
  blocks: [
    patient(ROBERT, [
      ["Policy Number:", "POL-CA-400101"],
      ["Payer:", `${BRAND.name} (out-of-network)`],
      ["Currency:", "USD"],
    ]),
    {
      type: "fields",
      title: "Admission",
      left: [
        ["Hospital:", "Atlantic Demo Medical Center"],
        ["Attending Physician:", "Dr. Rachel Goldman"],
        ["Diagnosis:", "Community-acquired pneumonia (J18.9)"],
      ],
      right: [
        ["Admission Date:", "2026-10-14"],
        ["Discharge Date:", "2026-10-18"],
        ["Unit:", "6 West"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "table",
      heading: "Itemized charges (CPT, HCPCS and revenue codes)",
      columns: MONEY,
      rows: robertCharges.rows,
      totals: [
        { label: "Total charges:", value: robertCharges.total },
        { label: "Total Amount Due:", value: `${robertCharges.total} USD`, strong: true },
      ],
      note: "Charges at the hospital's standard rates. Out-of-network: the patient is responsible for any balance the plan does not pay.",
    },
    {
      type: "signature",
      caption: "Patient Financial Services",
      name: "Billing Department",
      role: "International Patient Accounts",
      place: "Fort Lauderdale, 2026-10-19",
      stamp: patientAccounts(ATLANTIC_MEDICAL),
    },
  ],
};

// Robert's medical report and discharge summary: with the statement, a complete claim (CLM-10230).
const robertMedicalReport: SampleDoc = {
  file: "medical-report-robert-tremblay-florida.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: { ...ATLANTIC_MEDICAL, tagline: "Department of Medicine" },
  title: "MEDICAL REPORT",
  subtitle: "Emergency admission · Internal Medicine",
  meta: [
    ["Report No:", "ADMC-MR-60412"],
    ["Report Date:", "2026-10-14"],
  ],
  seed: { kind: "MEDICAL_REPORT", patientRef: "PAT-0962", caseRef: "CASE-1004", claimRef: "CLM-10230" },
  blocks: [
    patient(ROBERT, [
      ["Policy Number:", "POL-CA-400101"],
      ["Sex:", "Male"],
      ["Phone:", "+1 514 000 0962"],
    ]),
    {
      type: "fields",
      title: "Admission",
      left: [
        ["Hospital:", "Atlantic Demo Medical Center"],
        ["Attending Physician:", "Dr. Rachel Goldman"],
        ["Admission Date:", "2026-10-14"],
      ],
      right: [
        ["Arrived by:", "Ambulance"],
        ["Unit:", "6 West"],
        ["Time:", "02:05"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "section",
      heading: "Assessment",
      labelWidth: 112,
      fields: [
        ["Diagnosis:", "Community-acquired pneumonia, right lower lobe"],
        ["Symptoms:", "fever 39.1 °C; productive cough; shortness of breath"],
        ["Procedures:", "Chest X-ray; blood cultures; IV ceftriaxone; nebulisers"],
      ],
    },
    {
      type: "section",
      heading: "Plan",
      text: [
        "72-year-old Canadian visitor admitted with right lower lobe pneumonia, oxygen saturation 91% on air. Started on intravenous antibiotics and nebulised bronchodilators; oxygen by nasal cannula.",
        "Expected length of stay four nights. Review for discharge once afebrile for 24 hours and saturating above 94% on air.",
      ],
    },
    {
      type: "signature",
      caption: "Attending physician",
      name: "Dr. Rachel Goldman",
      role: "Internal Medicine",
      place: "Fort Lauderdale, 2026-10-14",
      stamp: certifiedCopy(ATLANTIC_MEDICAL, "Fort Lauderdale"),
    },
  ],
};

const robertDischarge: SampleDoc = {
  file: "discharge-summary-robert-tremblay-florida.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: { ...ATLANTIC_MEDICAL, tagline: "Department of Medicine" },
  title: "DISCHARGE SUMMARY",
  subtitle: "Internal Medicine",
  meta: [
    ["Summary No:", "ADMC-DS-60412"],
    ["Date:", "2026-10-18"],
  ],
  seed: { kind: "DISCHARGE_SUMMARY", patientRef: "PAT-0962", caseRef: "CASE-1004", claimRef: "CLM-10230" },
  blocks: [
    patient(ROBERT, [
      ["Policy Number:", "POL-CA-400101"],
      ["Sex:", "Male"],
      ["Unit:", "6 West"],
    ]),
    {
      type: "fields",
      title: "Stay",
      left: [
        ["Hospital:", "Atlantic Demo Medical Center"],
        ["Attending Physician:", "Dr. Rachel Goldman"],
        ["Diagnosis:", "Community-acquired pneumonia"],
      ],
      right: [
        ["Admission Date:", "2026-10-14"],
        ["Discharge Date:", "2026-10-18"],
        ["Nights:", "4"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "section",
      heading: "Course and discharge",
      labelWidth: 112,
      fields: [
        ["Medications:", "Amoxicillin-clavulanate 875 mg twice daily for 5 days"],
      ],
      text: [
        "Afebrile from day 3; saturations 96% on air at discharge. Discharged home to his winter residence in a stable condition. Fit to fly to Montreal from 25 October.",
      ],
    },
    {
      type: "signature",
      caption: "Attending physician",
      name: "Dr. Rachel Goldman",
      role: "Internal Medicine",
      place: "Fort Lauderdale, 2026-10-18",
      stamp: certifiedCopy(ATLANTIC_MEDICAL, "Fort Lauderdale"),
    },
  ],
};

// --- Matteo Ferraro: appendicitis in Saranda, Albania (CASE-1005) ------------

const matteoCharges = charges([
  ["520.030", "Emergency department admission", 1, 9500],
  ["802.050", "Ultrasound, abdomen", 1, 6500],
  ["612.500", "Laparoscopic appendectomy", 1, 185000],
  ["520.090", "Physician and anaesthesia fees", 1, 48000],
  ["510.120", "Ward accommodation (per night)", 4, 12000],
  ["901.010", "Laboratory: blood count, CRP, electrolytes", 2, 4500],
  ["901.010", "Laboratory: blood count, CRP, electrolytes", 2, 4500],
  ["600.200", "Medication and consumables", 1, 21000],
  ["950.920", "Companion meals", 1, 6000],
]);

const matteoInvoice: SampleDoc = {
  file: "invoice-matteo-ferraro-saranda.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: SARANDA_POLYCLINIC,
  title: "INVOICE",
  subtitle: "Final invoice, inpatient stay",
  meta: [
    ["Invoice No:", "SDP-INV-2026-0388"],
    ["Invoice Date:", "2026-10-22"],
    ["Case:", "CASE-1005"],
  ],
  blocks: [
    patient(MATTEO, [
      ["Policy Number:", "POL-AL-700101"],
      ["Payer:", `${BRAND.name} (direct billing)`],
      ["Currency:", "ALL"],
    ]),
    {
      type: "fields",
      title: "Stay",
      left: [
        ["Hospital:", "Saranda Demo Polyclinic"],
        ["Attending Physician:", "Dr. Arben Hoxha"],
        ["Diagnosis:", "Acute appendicitis (K35.8)"],
      ],
      right: [
        ["Admission Date:", "2026-10-19"],
        ["Discharge Date:", "2026-10-22"],
        ["Room:", "Bed 6"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "table",
      heading: "Itemised charges",
      columns: MONEY,
      rows: matteoCharges.rows,
      totals: [{ label: "Total Amount Due:", value: `${matteoCharges.total} ALL`, strong: true }],
      note: "Payment in Albanian lek or euro at the Bank of Albania rate on the day of payment.",
    },
    {
      type: "signature",
      caption: "Billing office stamp",
      name: "Patient Accounts",
      role: "Saranda Demo Polyclinic",
      place: "Saranda, 2026-10-22",
      stamp: certifiedCopy(SARANDA_POLYCLINIC, "Saranda"),
    },
  ],
};

// --- Thandiwe Nkosi: renal colic in Dubai (CASE-1007) -------------------------

const thandiweCharges = charges([
  ["520.030", "Emergency department admission", 1, 1200],
  ["802.110", "CT scan, kidneys, ureters and bladder", 1, 1900],
  ["612.700", "Ureteroscopy with laser stone removal", 1, 14500],
  ["520.090", "Physician and anaesthesia fees", 1, 3200],
  ["510.120", "Ward accommodation (per night)", 2, 2100],
  ["901.060", "Laboratory: urinalysis and culture", 1, 260],
  ["600.200", "Medication and consumables", 1, 950],
  ["950.900", "Telephone and television", 1, 120],
]);

const thandiweInvoice: SampleDoc = {
  file: "invoice-thandiwe-nkosi-dubai.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: JUMEIRAH_HOSPITAL,
  title: "INVOICE",
  subtitle: "Final invoice, inpatient stay",
  meta: [
    ["Invoice No:", "JDH-INV-2026-9054"],
    ["Invoice Date:", "2026-10-23"],
    ["Case:", "CASE-1007"],
  ],
  blocks: [
    patient(THANDIWE, [
      ["Policy Number:", "POL-ZA-800101"],
      ["Payer:", `${BRAND.name} (direct billing)`],
      ["Currency:", "AED"],
    ]),
    {
      type: "fields",
      title: "Stay",
      left: [
        ["Hospital:", "Jumeirah Demo Hospital"],
        ["Attending Physician:", "Dr. Fatima Al Hashimi"],
        ["Diagnosis:", "Ureteric stone, renal colic (N20.1)"],
      ],
      right: [
        ["Admission Date:", "2026-10-21"],
        ["Discharge Date:", "2026-10-23"],
        ["Room:", "Room 318"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "table",
      heading: "Itemised charges",
      columns: MONEY,
      rows: thandiweCharges.rows,
      totals: [
        { label: "Subtotal:", value: thandiweCharges.total },
        { label: "VAT (healthcare):", value: "zero-rated" },
        { label: "Total Amount Due:", value: `${thandiweCharges.total} AED`, strong: true },
      ],
      note: "Direct billing to the insurer's assistance company. Payment within 45 days.",
    },
    {
      type: "signature",
      caption: "Insurance office stamp",
      name: "Insurance Department",
      role: "Jumeirah Demo Hospital",
      place: "Dubai, 2026-10-23",
      stamp: patientAccounts(JUMEIRAH_HOSPITAL),
    },
  ],
};

// --- Khalid Al Suwaidi: ski accident, operated in Geneva (CASE-1008) ----------

const khalidCharges = charges([
  ["520.030", "Emergency department admission", 1, 420],
  ["802.110", "CT scan, left knee", 1, 680],
  ["612.800", "ORIF, tibial plateau fracture", 1, 9800],
  ["520.090", "Physician and anaesthesia fees", 1, 1450],
  ["510.120", "Ward accommodation (per night)", 5, 1150],
  ["510.160", "Private room supplement (per night)", 5, 380],
  ["930.010", "Physiotherapy session", 4, 140],
  ["950.110", "Crutches (pair)", 1, 95],
  ["600.200", "Medication and consumables", 1, 640],
]);

const khalidInvoice: SampleDoc = {
  file: "invoice-khalid-al-suwaidi-geneva.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: LEMAN_CLINIC,
  title: "INVOICE",
  subtitle: "Final invoice, inpatient stay",
  meta: [
    ["Invoice No:", "LLC-INV-2026-1170"],
    ["Invoice Date:", "2026-10-22"],
    ["Case:", "CASE-1008"],
  ],
  blocks: [
    patient(KHALID, [
      ["Policy Number:", "POL-AE-900101"],
      ["Payer:", `${BRAND.name} (direct billing)`],
      ["Currency:", "CHF"],
    ]),
    {
      type: "fields",
      title: "Stay",
      left: [
        ["Hospital:", "Lac Léman Demo Clinic"],
        ["Attending Physician:", "Dr. Luc Favre"],
        ["Diagnosis:", "Tibial plateau fracture, left (S82.1)"],
      ],
      right: [
        ["Admission Date:", "2026-10-17"],
        ["Discharge Date:", "2026-10-22"],
        ["Room:", "Room 5.14"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "table",
      heading: "Itemised charges",
      columns: MONEY,
      rows: khalidCharges.rows,
      totals: [{ label: "Total Amount Due:", value: `${khalidCharges.total} CHF`, strong: true }],
      note: "Payable within 30 days. Transferred from Zermatt by helicopter on 17 October (billed separately by the operator).",
    },
    {
      type: "signature",
      caption: "Billing office stamp",
      name: "Service de facturation",
      role: "International Patients",
      place: "Genève, 2026-10-22",
      stamp: facturation(LEMAN_CLINIC),
    },
  ],
};

export const REGION_SAMPLE_DOCS: SampleDoc[] = [
  hannahFinalInvoice,
  sarahReportEs,
  sarahInvoice,
  pierreDischargeFr,
  pierreInvoiceFr,
  robertUsBill,
  robertMedicalReport,
  robertDischarge,
  matteoInvoice,
  thandiweInvoice,
  khalidInvoice,
];
