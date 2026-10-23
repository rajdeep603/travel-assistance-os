import { BRAND } from "../../src/lib/brand";
import { REGION_SAMPLE_DOCS } from "./documents-regions";
import type { Block, Field, SampleDoc } from "./model";
import {
  BESIKTAS_SPORTS,
  BOSPHORUS_ORTHO,
  ISTANBUL_CENTRAL,
  MARMARA_HEART,
  MARMARA_HEART_TR,
  PUDONG_INTERNATIONAL,
  SUKHUMVIT_INTERNATIONAL,
  billingOffice,
  certifiedCopy,
  paid,
  patientAccounts,
  trueCopy,
} from "./issuers";

// ---------------------------------------------------------------------------
// Every fictional sample document the platform reads. People, policies and
// cases match prisma/seed-data.ts, so uploads land on the right records.
// ALL CONTENT IS FICTIONAL DEMO DATA: no real people, hospitals or policies.
//
// Classification rules the offline model applies (first match wins), which
// the wording here respects:
//   cost estimate → invoice/billing/amount due → discharge → prescription/rx
//   → medical report.
// So a medical report never says "discharge", "billing" or "prescribed".
// ---------------------------------------------------------------------------

const AYLIN: Field[] = [
  ["Patient Name:", "Aylin Yilmaz"],
  ["Date of Birth:", "1987-03-14"],
  ["Nationality:", "United Kingdom"],
];
const JAMES: Field[] = [
  ["Patient Name:", "James Carter"],
  ["Date of Birth:", "1979-11-02"],
  ["Nationality:", "United States"],
];
const LENA: Field[] = [
  ["Patient Name:", "Lena Koch"],
  ["Date of Birth:", "1964-07-29"],
  ["Nationality:", "Germany"],
];
const OLIVER: Field[] = [
  ["Patient Name:", "Oliver Bennett"],
  ["Date of Birth:", "1956-12-05"],
  ["Nationality:", "United Kingdom"],
];
const CARLOS: Field[] = [
  ["Patient Name:", "Carlos Garcia"],
  ["Date of Birth:", "1973-04-30"],
  ["Nationality:", "Spain"],
];

// Asia-Pacific patients (PAT-0951, PAT-0952).
const DANIEL: Field[] = [
  ["Patient Name:", "Daniel Tan"],
  ["Date of Birth:", "1964-03-03"],
  ["Nationality:", "Singapore"],
];
const RACHEL: Field[] = [
  ["Patient Name:", "Rachel Lim"],
  ["Date of Birth:", "1991-08-17"],
  ["Nationality:", "Singapore"],
];

const patient = (left: Field[], right: Field[]): Block => ({ type: "fields", title: "Patient", left, right, split: 0.55 });

const MONEY = [
  { label: "Code", width: 0.12 },
  { label: "Description", width: 0.46 },
  { label: "Qty", width: 0.08, align: "right" as const },
  { label: "Unit price", width: 0.16, align: "right" as const },
  { label: "Amount", width: 0.18, align: "right" as const },
];

// --- Aylin Yilmaz: gastroenteritis, Istanbul Central (CASE-1020, CLM-10245) ---

const aylinMedicalReport: SampleDoc = {
  file: "medical-report-aylin-yilmaz.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: ISTANBUL_CENTRAL,
  title: "MEDICAL REPORT",
  subtitle: "Internal Medicine · Emergency admission",
  meta: [
    ["Report No:", "MR-2026-118742"],
    ["Report Date:", "2026-09-19"],
  ],
  seed: { kind: "MEDICAL_REPORT", patientRef: "PAT-1001", caseRef: "CASE-1020", claimRef: "CLM-10245" },
  blocks: [
    patient(AYLIN, [
      ["Patient ID:", "2026/118742"],
      ["Sex:", "Female"],
      ["Phone:", "+44 7700 900144"],
    ]),
    {
      type: "fields",
      title: "Admission",
      left: [
        ["Hospital:", "Istanbul Central Demo Hospital"],
        ["Department:", "Internal Medicine"],
        ["Attending Physician:", "Dr. Kerem Aydin"],
      ],
      right: [
        ["Admission Date:", "2026-09-18"],
        ["Arrived by:", "Ambulance"],
        ["Ward:", "4B, bed 12"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "section",
      heading: "Presenting complaint",
      fields: [["Presenting Symptoms:", "severe abdominal pain, nausea, dehydration"]],
      text: [
        "Two days of vomiting, watery stools and abdominal cramps while travelling. Unable to keep fluids down since the morning of admission. No known allergies; no regular medication.",
      ],
    },
    {
      type: "table",
      heading: "Investigations",
      columns: [
        { label: "Test", width: 0.4 },
        { label: "Result", width: 0.2, align: "right" },
        { label: "Reference range", width: 0.28, align: "right" },
        { label: "Flag", width: 0.12, align: "right" },
      ],
      rows: [
        ["White cell count", "13.2 ×10³/µL", "4.0 – 10.0", "H"],
        ["C-reactive protein", "38 mg/L", "< 5", "H"],
        ["Sodium", "133 mmol/L", "136 – 145", "L"],
        ["Potassium", "3.4 mmol/L", "3.5 – 5.1", "L"],
        ["Creatinine", "0.9 mg/dL", "0.6 – 1.1", ""],
        ["Stool culture", "pending", "", ""],
      ],
    },
    {
      type: "section",
      heading: "Assessment and treatment",
      fields: [
        ["Diagnosis:", "Acute gastroenteritis (ICD-10 K52.9)"],
        ["Procedures:", "Intravenous rehydration, blood panel, stool culture"],
        ["Medications:", "Ondansetron 4mg, Oral rehydration salts"],
      ],
      text: [
        "Condition stabilised within 24 hours of admission. No surgical intervention required. Rest and oral hydration recommended for 5 days; return if fever or bloody stools develop.",
      ],
    },
    {
      type: "signature",
      caption: "Physician's signature and stamp",
      name: "Dr. Kerem Aydin",
      role: "Internal Medicine · Reg. 34-11872",
      place: "İstanbul, 2026-09-19",
      stamp: trueCopy(ISTANBUL_CENTRAL),
    },
  ],
};

const aylinInvoice: SampleDoc = {
  file: "hospital-invoice-aylin-yilmaz.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: ISTANBUL_CENTRAL,
  title: "INVOICE",
  subtitle: "Fatura · Inpatient services",
  meta: [
    ["Invoice No:", "INV-2026-08841"],
    ["Invoice Date:", "2026-09-20"],
    ["Payment:", "Paid at discharge"],
  ],
  seed: { kind: "HOSPITAL_INVOICE", patientRef: "PAT-1001", caseRef: "CASE-1020", claimRef: "CLM-10245" },
  blocks: [
    patient(AYLIN, [
      ["Patient ID:", "2026/118742"],
      ["Payer:", "Patient (self-pay)"],
      ["Currency:", "TRY"],
    ]),
    {
      type: "fields",
      title: "Episode",
      left: [
        ["Hospital:", "Istanbul Central Demo Hospital"],
        ["Department:", "Internal Medicine"],
      ],
      right: [
        ["Admission Date:", "2026-09-18"],
        ["Discharge Date:", "2026-09-20"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "table",
      heading: "Itemised charges",
      columns: MONEY,
      rows: [
        ["520.030", "Emergency department admission", "1", "6,500.00", "6,500.00"],
        ["510.120", "Ward accommodation (per night)", "2", "4,500.00", "9,000.00"],
        ["901.010", "Laboratory: blood count, CRP, electrolytes", "1", "2,150.00", "2,150.00"],
        ["901.430", "Laboratory: stool culture", "1", "1,100.00", "1,100.00"],
        ["600.200", "Medication and consumables", "1", "2,100.00", "2,100.00"],
        ["520.080", "Physician fees, internal medicine", "1", "4,400.00", "4,400.00"],
      ],
      totals: [
        { label: "Subtotal:", value: "25,250.00" },
        { label: "VAT included (KDV 10%):", value: "2,295.45" },
        { label: "Grand Total:", value: "25,250.00 TRY", strong: true },
      ],
      note: "Paid in full by card at discharge (POS ref. 118204). Please quote the invoice number in any correspondence.",
    },
    {
      type: "signature",
      caption: "Cashier's stamp",
      name: "Patient Accounts",
      role: "International Patient Center",
      place: "İstanbul, 2026-09-20",
      stamp: paid(ISTANBUL_CENTRAL, "20.09.2026"),
    },
  ],
};

const aylinDischarge: SampleDoc = {
  file: "discharge-summary-aylin-yilmaz.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: ISTANBUL_CENTRAL,
  title: "DISCHARGE SUMMARY",
  subtitle: "Internal Medicine",
  meta: [
    ["Document No:", "DS-2026-118742"],
    ["Date:", "2026-09-20"],
  ],
  seed: { kind: "DISCHARGE_SUMMARY", patientRef: "PAT-1001", caseRef: "CASE-1020", claimRef: "CLM-10245" },
  blocks: [
    patient(AYLIN, [
      ["Patient ID:", "2026/118742"],
      ["Sex:", "Female"],
    ]),
    {
      type: "fields",
      title: "Stay",
      left: [
        ["Hospital:", "Istanbul Central Demo Hospital"],
        ["Attending Physician:", "Dr. Kerem Aydin"],
      ],
      right: [
        ["Admission Date:", "2026-09-18"],
        ["Discharge Date:", "2026-09-20"],
        ["Length of stay:", "2 nights"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "section",
      heading: "Diagnosis",
      fields: [
        ["Diagnosis:", "Acute gastroenteritis (ICD-10 K52.9)"],
        ["Secondary Diagnosis:", "Mild dehydration (ICD-10 E86.0)"],
      ],
    },
    {
      type: "section",
      heading: "Hospital course",
      fields: [["Procedures:", "Intravenous rehydration, blood panel, stool culture"]],
      text: [
        "Admitted from the emergency department with vomiting, diarrhoea and dehydration. Treated with intravenous fluids and antiemetics; symptoms settled within 24 hours. Tolerating oral fluids and a light diet since day 2. Stool culture result to follow by e-mail.",
      ],
    },
    {
      type: "section",
      heading: "Medication on leaving",
      fields: [["Medications:", "Ondansetron 4mg, Oral rehydration salts"]],
    },
    {
      type: "table",
      columns: [
        { label: "Medicine", width: 0.34 },
        { label: "Dose", width: 0.18 },
        { label: "How often", width: 0.28 },
        { label: "For", width: 0.2 },
      ],
      rows: [
        ["Ondansetron", "4 mg tablet", "twice daily", "3 days"],
        ["Oral rehydration salts", "1 sachet", "after each loose stool", "as needed"],
      ],
    },
    {
      type: "section",
      heading: "Condition at discharge",
      text: [
        "Stable and afebrile. Fit to continue travel after 5 days of rest. See a general practitioner if symptoms return.",
      ],
    },
    {
      type: "signature",
      caption: "Physician's signature and stamp",
      name: "Dr. Kerem Aydin",
      role: "Internal Medicine · Reg. 34-11872",
      place: "İstanbul, 2026-09-20",
      stamp: trueCopy(ISTANBUL_CENTRAL),
    },
  ],
};

const aylinPrescription: SampleDoc = {
  file: "prescription-aylin-yilmaz.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: ISTANBUL_CENTRAL,
  title: "PRESCRIPTION",
  subtitle: "Reçete · outpatient",
  meta: [
    ["Prescription No:", "RX-2026-5521"],
    ["Date:", "2026-09-20"],
  ],
  seed: { kind: "PRESCRIPTION", patientRef: "PAT-1001", claimRef: "CLM-10244" },
  blocks: [
    patient(
      [
        ["Patient Name:", "Aylin Yilmaz"],
        ["Date of Birth:", "1987-03-14"],
        ["Policy Number:", "POL-TR-100944"],
      ],
      [
        ["Patient ID:", "2026/118742"],
        ["Sex:", "Female"],
      ]
    ),
    {
      type: "fields",
      title: "Prescriber",
      left: [
        ["Hospital:", "Istanbul Central Demo Hospital"],
        ["Prescribing Doctor:", "Dr. Kerem Aydin"],
      ],
      right: [["Department:", "Internal Medicine"]],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "section",
      heading: "Diagnosis",
      fields: [["Diagnosis:", "Acute gastroenteritis (ICD-10 K52.9)"]],
    },
    { type: "rx" },
    {
      type: "table",
      columns: [
        { label: "#", width: 0.06 },
        { label: "Medicine", width: 0.36 },
        { label: "Form", width: 0.2 },
        { label: "Pack", width: 0.1, align: "right" },
        { label: "Directions", width: 0.28 },
      ],
      rows: [
        ["1", "Ondansetron 4 mg", "film-coated tablet", "1", "twice daily for 3 days"],
        ["2", "Oral rehydration salts", "sachet", "1", "after each loose stool"],
      ],
    },
    {
      type: "section",
      heading: "Dispensing",
      fields: [["Medications:", "Ondansetron 4mg, Oral rehydration salts"]],
      text: ["Valid for 3 days from the date of issue at any pharmacy in Türkiye."],
    },
    {
      type: "signature",
      caption: "Prescriber's signature and stamp",
      name: "Dr. Kerem Aydin",
      role: "Internal Medicine · Reg. 34-11872",
      place: "İstanbul, 2026-09-20",
      stamp: trueCopy(ISTANBUL_CENTRAL),
    },
  ],
};

// --- James Carter: ankle fracture, Bosphorus Ortho (CASE-1021, CLM-10243) ---
// The report is deliberately unsigned and carries no policy number, so the
// demo shows the AI asking for both.

const jamesMedicalReport: SampleDoc = {
  file: "medical-report-james-carter.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: BOSPHORUS_ORTHO,
  title: "MEDICAL REPORT",
  subtitle: "Orthopaedics · Emergency visit",
  meta: [
    ["Report No:", "BOC-2026-04417"],
    ["Report Date:", "2026-09-21"],
  ],
  seed: { kind: "MEDICAL_REPORT", patientRef: "PAT-1002", caseRef: "CASE-1021", claimRef: "CLM-10243" },
  blocks: [
    patient(JAMES, [
      ["Patient ID:", "BOC-77120"],
      ["Sex:", "Male"],
      ["Phone:", "+1 555 010 0145"],
    ]),
    {
      type: "fields",
      title: "Visit",
      left: [
        ["Hospital:", "Bosphorus Demo Orthopedic Clinic"],
        ["Department:", "Orthopedics"],
        ["Attending Physician:", "Dr. Selin Kaya"],
      ],
      right: [
        ["Admission Date:", "2026-09-21"],
        ["Arrived by:", "Taxi, on crutches"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "section",
      heading: "History",
      fields: [["Presenting Symptoms:", "right ankle pain and swelling after a fall"]],
      text: [
        "Slipped on wet stairs near Galata Tower the same afternoon. Unable to bear weight. No head injury, no loss of consciousness.",
      ],
    },
    {
      type: "section",
      heading: "Imaging",
      text: [
        "X-ray of the right ankle (AP, lateral and mortise views): non-displaced fracture of the lateral malleolus. Ankle mortise congruent; no other bony injury.",
      ],
    },
    {
      type: "section",
      heading: "Assessment and plan",
      fields: [
        ["Diagnosis:", "Right lateral malleolus fracture, non-displaced (S82.6)"],
        ["Procedures:", "X-ray imaging, cast immobilisation"],
        ["Medications:", "Ibuprofen 400mg"],
      ],
      text: [
        "Below-knee cast applied; crutches provided; no weight bearing for 2 weeks. Orthopaedic review in 10 days. Fit to fly after that review.",
      ],
    },
    {
      type: "signature",
      caption: "Physician stamp",
      name: "Dr. Selin Kaya",
      role: "Orthopaedic Surgeon",
      unsigned: true,
    },
  ],
};

const jamesInvoice: SampleDoc = {
  file: "hospital-invoice-james-carter.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: BOSPHORUS_ORTHO,
  title: "INVOICE",
  subtitle: "Fatura · Outpatient services",
  meta: [
    ["Invoice No:", "INV-2026-09102"],
    ["Invoice Date:", "2026-09-21"],
    ["Payment:", "Card, 2026-09-21"],
  ],
  seed: { kind: "HOSPITAL_INVOICE", patientRef: "PAT-1002", caseRef: "CASE-1021", claimRef: "CLM-10243" },
  blocks: [
    patient(JAMES, [
      ["Patient ID:", "BOC-77120"],
      ["Payer:", "Patient (self-pay)"],
      ["Currency:", "EUR"],
    ]),
    {
      type: "fields",
      title: "Visit",
      left: [
        ["Hospital:", "Bosphorus Demo Orthopedic Clinic"],
        ["Department:", "Orthopedics"],
      ],
      right: [["Admission Date:", "2026-09-21"]],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "table",
      heading: "Itemised charges",
      columns: MONEY,
      rows: [
        ["520.010", "Emergency orthopaedic consultation", "1", "180.00", "180.00"],
        ["801.220", "X-ray, ankle (2 views)", "1", "220.00", "220.00"],
        ["612.040", "Below-knee cast, application and materials", "1", "340.00", "340.00"],
        ["950.110", "Crutches (pair)", "1", "60.00", "60.00"],
      ],
      totals: [
        { label: "Subtotal:", value: "800.00" },
        { label: "VAT included (KDV 10%):", value: "72.73" },
        { label: "Grand Total:", value: "800.00 EUR", strong: true },
      ],
      note: "Paid by card on 2026-09-21. Foreign patients are invoiced in EUR at the hospital's daily rate.",
    },
    {
      type: "signature",
      caption: "Cashier's stamp",
      name: "Front Desk",
      role: "Patient Services",
      place: "İstanbul, 2026-09-21",
      stamp: paid(BOSPHORUS_ORTHO, "21.09.2026"),
    },
  ],
};

// --- Lena Koch: chest pain, Marmara Heart (CASE-1022) ---

const lenaEmergencyReport: SampleDoc = {
  file: "emergency-report-lena-koch.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: MARMARA_HEART,
  title: "EMERGENCY MEDICAL REPORT",
  subtitle: "Cardiology emergency unit",
  meta: [
    ["Report No:", "MHC-ER-2026-3391"],
    ["Report Date:", "2026-09-23"],
  ],
  seed: { kind: "MEDICAL_REPORT", patientRef: "PAT-1003", caseRef: "CASE-1022" },
  blocks: [
    patient(LENA, [
      ["Policy Number:", "POL-TR-100946"],
      ["Patient ID:", "MHC-2026-3391"],
      ["Sex:", "Female"],
    ]),
    {
      type: "fields",
      title: "Admission",
      left: [
        ["Hospital:", "Marmara Demo Heart Center"],
        ["Department:", "Cardiology"],
        ["Attending Physician:", "Dr. Baran Ozturk"],
      ],
      right: [
        ["Admission Date:", "2026-09-23"],
        ["Arrived by:", "Ambulance (112)"],
        ["Triage:", "Red"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "section",
      heading: "Presentation",
      fields: [["Presenting Symptoms:", "chest pain, shortness of breath"]],
      text: [
        "Brought from her hotel in Şişli with central chest pain at rest for 40 minutes, radiating to the left arm. Blood pressure 158/92, heart rate 96, oxygen saturation 95% on air.",
      ],
    },
    {
      type: "table",
      heading: "Investigations",
      columns: [
        { label: "Test", width: 0.42 },
        { label: "Result", width: 0.3, align: "right" },
        { label: "Reference", width: 0.28, align: "right" },
      ],
      rows: [
        ["ECG on arrival", "ST depression V4–V6", ""],
        ["Troponin I, 0 h", "0.01 ng/mL", "< 0.04"],
        ["Troponin I, 3 h", "0.02 ng/mL", "< 0.04"],
        ["Coronary CT angiography", "moderate LAD stenosis", ""],
      ],
    },
    {
      type: "section",
      heading: "Assessment",
      fields: [
        ["Diagnosis:", "Unstable angina, ruled out myocardial infarction (I20.0)"],
        ["Procedures:", "ECG, troponin series, coronary CT angiography"],
        ["Medications:", "Aspirin 100mg, Atorvastatin 40mg, Metoprolol 25mg"],
      ],
      text: [
        "Serial troponins negative. Conservative management recommended. Cardiology follow-up required within one week; fit to fly with medical clearance only.",
      ],
    },
    {
      type: "signature",
      caption: "Physician's signature and stamp",
      name: "Dr. Baran Ozturk",
      role: "Cardiologist · Reg. 34-20551",
      place: "İstanbul, 2026-09-23",
      stamp: trueCopy(MARMARA_HEART),
    },
  ],
};

const lenaDischarge: SampleDoc = {
  file: "discharge-summary-lena-koch.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: MARMARA_HEART,
  title: "DISCHARGE SUMMARY",
  subtitle: "Cardiology",
  meta: [
    ["Document No:", "MHC-DS-2026-3391"],
    ["Date:", "2026-09-25"],
  ],
  seed: { kind: "DISCHARGE_SUMMARY", patientRef: "PAT-1003", caseRef: "CASE-1022" },
  blocks: [
    patient(LENA, [
      ["Policy Number:", "POL-TR-100946"],
      ["Patient ID:", "MHC-2026-3391"],
    ]),
    {
      type: "fields",
      title: "Stay",
      left: [
        ["Hospital:", "Marmara Demo Heart Center"],
        ["Attending Physician:", "Dr. Baran Ozturk"],
      ],
      right: [
        ["Admission Date:", "2026-09-23"],
        ["Discharge Date:", "2026-09-25"],
        ["Length of stay:", "2 nights"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "section",
      heading: "Diagnosis and treatment",
      fields: [
        ["Diagnosis:", "Unstable angina (ICD-10 I20.0)"],
        ["Procedures:", "ECG, troponin series, coronary CT angiography"],
        ["Medications:", "Aspirin 100mg, Atorvastatin 40mg, Metoprolol 25mg"],
      ],
      text: [
        "Monitored on the cardiology ward for 48 hours without further pain. Started on antiplatelet, statin and beta-blocker therapy.",
      ],
    },
    {
      type: "section",
      heading: "Condition at discharge",
      text: [
        "Stable on medication. Cardiology review needed before flight clearance; avoid strenuous activity. Copy of ECG and CT report enclosed.",
      ],
    },
    {
      type: "signature",
      caption: "Physician's signature and stamp",
      name: "Dr. Baran Ozturk",
      role: "Cardiologist · Reg. 34-20551",
      place: "İstanbul, 2026-09-25",
      stamp: trueCopy(MARMARA_HEART),
    },
  ],
};

const lenaInvoice: SampleDoc = {
  file: "hospital-invoice-lena-koch.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: MARMARA_HEART,
  title: "INVOICE",
  subtitle: "Fatura · Inpatient services",
  meta: [
    ["Invoice No:", "MHC-INV-2026-1187"],
    ["Invoice Date:", "2026-09-25"],
    ["Due Date:", "2026-10-25"],
  ],
  blocks: [
    patient(LENA, [
      ["Policy Number:", "POL-TR-100946"],
      ["Payer:", "Travel insurer, direct"],
      ["Currency:", "EUR"],
    ]),
    {
      type: "fields",
      title: "Stay",
      left: [
        ["Hospital:", "Marmara Demo Heart Center"],
        ["Department:", "Cardiology"],
      ],
      right: [
        ["Admission Date:", "2026-09-23"],
        ["Discharge Date:", "2026-09-25"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "table",
      heading: "Itemised charges",
      columns: MONEY,
      rows: [
        ["520.050", "Emergency cardiology assessment", "1", "650.00", "650.00"],
        ["803.410", "Coronary CT angiography", "1", "1,450.00", "1,450.00"],
        ["901.220", "Laboratory: troponin series, lipids", "1", "380.00", "380.00"],
        ["510.140", "Cardiology ward (per night)", "2", "720.00", "1,440.00"],
        ["600.200", "Medication and consumables", "1", "140.00", "140.00"],
      ],
      totals: [
        { label: "Subtotal:", value: "4,060.00" },
        { label: "VAT included (KDV 10%):", value: "369.09" },
        { label: "Total Amount Due:", value: "4,060.00 EUR", strong: true },
      ],
      note: "Payment within 30 days. Please quote the invoice number and the patient's policy number.",
    },
    {
      type: "signature",
      caption: "Billing office stamp",
      name: "Billing Office",
      role: "International Patient Center",
      place: "İstanbul, 2026-09-25",
      stamp: billingOffice(MARMARA_HEART),
    },
  ],
};

// The final bill for Lena's October stay, sent to the assistance company for
// direct billing against LOG-0902 (EUR 11,850). Deliberately overbilled, the
// way tourist-area invoices often are: inflated prices, a night more than the
// stay, a duplicate CT, a VIP suite and comfort items. Bill review brings it
// back inside the guarantee.
const lenaFinalInvoice: SampleDoc = {
  file: "final-invoice-lena-koch.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: MARMARA_HEART,
  title: "INVOICE",
  subtitle: "Fatura · Final invoice, inpatient stay",
  meta: [
    ["Invoice No:", "MHC-INV-2026-1342"],
    ["Invoice Date:", "2026-10-15"],
    ["Guarantee:", "LOG-0902"],
  ],
  blocks: [
    patient(LENA, [
      ["Policy Number:", "POL-TR-100946"],
      ["Payer:", `${BRAND.name} (direct billing)`],
      ["Currency:", "EUR"],
    ]),
    {
      type: "fields",
      title: "Stay",
      left: [
        ["Hospital:", "Marmara Demo Heart Center"],
        ["Attending Physician:", "Dr. Baran Ozturk"],
        ["Diagnosis:", "Unstable angina (ICD-10 I20.0)"],
      ],
      right: [
        ["Admission Date:", "2026-10-12"],
        ["Discharge Date:", "2026-10-14"],
        ["Room:", "CCU suite 4"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "table",
      heading: "Itemised charges",
      columns: MONEY,
      rows: [
        ["520.050", "Emergency cardiology assessment", "1", "1,250.00", "1,250.00"],
        ["803.500", "Coronary angiography, diagnostic", "1", "3,400.00", "3,400.00"],
        ["510.140", "Cardiology ward (per night)", "3", "720.00", "2,160.00"],
        ["510.160", "VIP suite supplement (per night)", "2", "450.00", "900.00"],
        ["803.410", "Coronary CT angiography", "1", "1,450.00", "1,450.00"],
        ["803.410", "Coronary CT angiography", "1", "1,450.00", "1,450.00"],
        ["901.220", "Laboratory: troponin series, lipids", "1", "380.00", "380.00"],
        ["600.200", "Medication and consumables", "1", "320.00", "320.00"],
        ["520.090", "Physician and anaesthesia fees", "1", "900.00", "900.00"],
        ["950.900", "Telephone and television", "1", "85.00", "85.00"],
        ["950.910", "Companion meals", "2", "45.00", "90.00"],
      ],
      totals: [
        { label: "Subtotal:", value: "12,385.00" },
        { label: "VAT included (KDV 10%):", value: "1,125.91" },
        { label: "Total Amount Due:", value: "12,385.00 EUR", strong: true },
      ],
      note: "Direct billing under the Letter of Guarantee LOG-0902. Payment within 30 days; please quote the invoice number.",
    },
    {
      type: "signature",
      caption: "Billing office stamp",
      name: "Billing Office",
      role: "International Patient Center",
      place: "İstanbul, 2026-10-15",
      stamp: billingOffice(MARMARA_HEART),
    },
  ],
};

// --- Oliver Bennett: cost estimate before angiography (CASE-1024) ---

const oliverEstimateBlocks: Block[] = [
  patient(OLIVER, [
    ["Policy Number:", "POL-TR-100950"],
    ["Patient ID:", "MHC-2026-4150"],
    ["Currency:", "EUR"],
  ]),
  {
    type: "fields",
    title: "Planned admission",
    left: [
      ["Hospital:", "Marmara Demo Heart Center"],
      ["Attending Physician:", "Dr. Baran Ozturk"],
      ["Department:", "Cardiology"],
    ],
    right: [
      ["Planned Admission:", "2026-10-15"],
      ["Length of stay:", "3 nights"],
    ],
    split: 0.58,
    labelWidth: 100,
  },
  {
    type: "section",
    heading: "Medical indication",
    fields: [
      ["Diagnosis:", "Suspected unstable angina"],
      ["Planned Treatment:", "Coronary angiography; 3 nights cardiology ward; cardiac monitoring"],
    ],
  },
  {
    type: "table",
    heading: "Estimated charges",
    columns: MONEY,
    rows: [
      ["803.500", "Coronary angiography, diagnostic", "1", "2,400.00", "2,400.00"],
      ["510.140", "Cardiology ward (per night)", "3", "950.00", "2,850.00"],
      ["901.300", "Cardiac monitoring and laboratory", "1", "900.00", "900.00"],
      ["520.090", "Physician and anaesthesia fees", "1", "700.00", "700.00"],
    ],
    totals: [{ label: "Estimated Total:", value: "6,850.00 EUR", strong: true }],
    note: "A Letter of Guarantee is required before the procedure. Please send it by fax to +90 212 000 2005 or by e-mail to billing@demo-heart.example.",
  },
  {
    type: "signature",
    caption: "Signed for the billing office",
    name: "Billing Office",
    role: "International Patient Center",
    place: "İstanbul, 2026-10-14",
    stamp: billingOffice(MARMARA_HEART),
  },
];

const oliverEstimate: SampleDoc = {
  file: "cost-estimate-oliver-bennett.pdf",
  dir: "demo-inbound",
  lang: "en",
  issuer: MARMARA_HEART,
  title: "COST ESTIMATE",
  subtitle: "Maliyet tahmini · pre-admission estimate for the insurer",
  meta: [
    ["Estimate No:", "MHC-CE-2026-0415"],
    ["Date:", "2026-10-14"],
    ["Valid until:", "2026-10-28"],
  ],
  blocks: oliverEstimateBlocks,
};

const oliverEstimateFax: SampleDoc = {
  ...oliverEstimate,
  file: "fax-cost-estimate-oliver-bennett.pdf",
  fax: { from: "+90 212 000 2005", to: "+1 555 010 0198", sentAt: "15/10/2026 09:42", station: "MARMARA DEMO HEART CTR" },
};

// --- Lena Koch: Turkish discharge summary (epikriz) and a handwritten fax ---

const lenaEpikriz: SampleDoc = {
  file: "epikriz-lena-koch.pdf",
  dir: "demo-inbound",
  lang: "tr",
  issuer: MARMARA_HEART_TR,
  title: "EPİKRİZ",
  subtitle: "Taburcu özeti · Kardiyoloji servisi",
  meta: [
    ["Protokol No:", "MHC-2026-4012"],
    ["Tarih:", "2026-10-14"],
  ],
  blocks: [
    {
      type: "fields",
      title: "Hasta",
      left: [
        ["Hasta Adı:", "Lena Koch"],
        ["Doğum Tarihi:", "1964-07-29"],
        ["Uyruk:", "Almanya"],
      ],
      right: [
        ["Poliçe No:", "POL-TR-100946"],
        ["Cinsiyet:", "Kadın"],
      ],
      split: 0.55,
    },
    {
      type: "fields",
      title: "Yatış",
      left: [
        ["Hastane:", "Marmara Demo Heart Center"],
        ["Sorumlu Hekim:", "Dr. Baran Ozturk"],
      ],
      right: [
        ["Yatış Tarihi:", "2026-10-12"],
        ["Taburcu Tarihi:", "2026-10-14"],
      ],
      split: 0.58,
      labelWidth: 96,
    },
    {
      type: "section",
      heading: "Klinik bilgiler",
      labelWidth: 110,
      fields: [
        ["Şikayetler:", "göğüs ağrısı, nefes darlığı"],
        ["Tanı:", "Kararsız angina pektoris (ICD-10 I20.0)"],
        ["Yapılan İşlemler:", "Koroner anjiyografi, EKG takibi"],
        ["İlaçlar:", "Aspirin 100mg, Metoprolol 50mg"],
      ],
    },
    {
      type: "section",
      heading: "Seyir ve öneriler",
      text: [
        "Hasta göğüs ağrısı ile acil servise başvurmuş, kardiyoloji servisine yatırılmıştır. Koroner anjiyografide kritik darlık saptanmamıştır.",
        "Hasta stabil durumda taburcu edilmiştir. Uçuş öncesi kardiyoloji kontrolü önerilir.",
      ],
    },
    {
      type: "signature",
      caption: "Hekim imza / kaşe · Signature",
      name: "Dr. Baran Ozturk",
      role: "Kardiyoloji Uzmanı · Tescil 34-20551",
      place: "İstanbul, 14.10.2026",
      stamp: trueCopy(MARMARA_HEART),
    },
  ],
};

const lenaFax: SampleDoc = {
  file: "fax-medical-report-lena-koch.pdf",
  dir: "demo-inbound",
  lang: "en",
  issuer: MARMARA_HEART,
  title: "FAX",
  subtitle: "Medical information for the assistance company",
  meta: [
    ["Date:", "2026-10-14"],
    ["Pages:", "1 of 1"],
  ],
  fax: { from: "+90 212 000 2005", to: "+1 555 010 0198", sentAt: "14/10/2026 16:05", station: "MARMARA DEMO HEART CTR", handwritten: true },
  blocks: [
    {
      type: "fields",
      left: [
        ["To:", `${BRAND.name} Medical Desk`],
        ["Fax:", "+1 555 010 0198"],
      ],
      right: [
        ["From:", "Dr. B. Ozturk, Cardiology"],
        ["Tel:", "+90 212 000 2005"],
      ],
      split: 0.5,
      labelWidth: 40,
    },
    {
      type: "section",
      heading: "Patient update",
      labelWidth: 110,
      fields: [
        ["Patient Name:", "Lena Koch"],
        ["Date of Birth:", "1964-07-29"],
        ["Policy Number:", "POL-TR-100946"],
        ["Diagnosis:", "Unstable angina, stable after treatment"],
        ["Procedures:", "Coronary angiography"],
        ["Discharge Date:", "2026-10-14"],
        ["Fit to fly:", "yes, with oxygen on request, after 2026-10-17"],
      ],
    },
    {
      type: "signature",
      caption: "Signed",
      name: "Dr. B. Ozturk",
      role: "Cardiology",
    },
    {
      type: "text",
      muted: true,
      text: [
        "This fax may contain confidential medical information. If you received it in error, please call +90 212 000 2005 and destroy it.",
      ],
    },
  ],
};

// --- Carlos Garcia: knee arthroscopy estimate (CASE-1015) ---

const carlosEstimate: SampleDoc = {
  file: "cost-estimate-carlos-garcia.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: BESIKTAS_SPORTS,
  title: "COST ESTIMATE",
  subtitle: "Pre-admission estimate for the insurer",
  meta: [
    ["Estimate No:", "BSM-CE-2026-0233"],
    ["Date:", "2026-10-16"],
    ["Valid until:", "2026-10-30"],
  ],
  blocks: [
    patient(CARLOS, [
      ["Policy Number:", "POL-TR-100952"],
      ["Patient ID:", "BSM-30981"],
      ["Currency:", "EUR"],
    ]),
    {
      type: "fields",
      title: "Planned admission",
      left: [
        ["Hospital:", "Besiktas Demo Sports Medicine"],
        ["Attending Physician:", "Dr. Cem Duran"],
        ["Department:", "Orthopaedic Sports Surgery"],
      ],
      right: [
        ["Planned Admission:", "2026-10-20"],
        ["Length of stay:", "1 night"],
      ],
      split: 0.58,
      labelWidth: 100,
    },
    {
      type: "section",
      heading: "Medical indication",
      fields: [
        ["Diagnosis:", "Acute medial meniscus tear, right knee (S83.2)"],
        ["Planned Treatment:", "Arthroscopic partial meniscectomy; 1 night ward"],
      ],
      text: [
        "Twisting injury while hiking on 2026-10-12. MRI on 2026-10-15 shows a displaced bucket-handle tear with locking of the knee.",
      ],
    },
    {
      type: "table",
      heading: "Estimated charges",
      columns: MONEY,
      rows: [
        ["612.300", "Knee arthroscopy, partial meniscectomy", "1", "2,600.00", "2,600.00"],
        ["520.090", "Anaesthesia", "1", "650.00", "650.00"],
        ["510.120", "Ward accommodation (per night)", "1", "480.00", "480.00"],
        ["930.010", "Physiotherapy sessions", "3", "90.00", "270.00"],
        ["950.120", "Knee brace and crutches", "1", "200.00", "200.00"],
      ],
      totals: [{ label: "Estimated Total:", value: "4,200.00 EUR", strong: true }],
      note: "A Letter of Guarantee is required before surgery. Please send it by fax to +90 212 000 2017.",
    },
    {
      type: "signature",
      caption: "Signed for the clinic",
      name: "Dr. Cem Duran",
      role: "Orthopaedic Surgeon · Reg. 34-30412",
      place: "İstanbul, 2026-10-16",
      stamp: trueCopy(BESIKTAS_SPORTS),
    },
  ],
};

// --- Asia-Pacific: the Singapore demo storyline ---------------------------------

// Daniel Tan: intracerebral haemorrhage in Shanghai; the assistance team plans
// his repatriation to Singapore. The report states his fitness for transfer,
// the facts a transport plan is priced on. Not seeded: it is uploaded onto the
// case the intake e-mail (email-family-shanghai-stroke.txt) creates.
const danielMedicalReport: SampleDoc = {
  file: "medical-report-daniel-tan.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: PUDONG_INTERNATIONAL,
  title: "MEDICAL REPORT",
  subtitle: "Neurology · Inpatient progress report",
  meta: [
    ["Report No:", "PDI-MR-2026-5108"],
    ["Report Date:", "2026-10-19"],
  ],
  blocks: [
    patient(DANIEL, [
      ["Policy Number:", "POL-SG-200101"],
      ["Patient ID:", "PDI-2026-5108"],
      ["Sex:", "Male"],
    ]),
    {
      type: "fields",
      title: "Admission",
      left: [
        ["Hospital:", "Pudong Demo Medical Center"],
        ["Department:", "Neurology"],
        ["Attending Physician:", "Dr. Zhang Wei"],
      ],
      right: [
        ["Admission Date:", "2026-10-14"],
        ["Arrived by:", "Ambulance (120)"],
        ["Ward:", "Neuro HDU, bed 6"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "section",
      heading: "Presentation",
      fields: [["Presenting Symptoms:", "right-sided weakness, slurred speech, BP 192/104"]],
    },
    {
      type: "table",
      heading: "Investigations",
      columns: [
        { label: "Test", width: 0.42 },
        { label: "Result", width: 0.34, align: "right" },
        { label: "Reference", width: 0.24, align: "right" },
      ],
      rows: [
        ["CT brain on arrival", "left basal ganglia bleed, 12 mL", ""],
        ["CT brain, day 3", "stable, no expansion", ""],
      ],
    },
    {
      type: "section",
      heading: "Assessment and treatment",
      fields: [
        ["Diagnosis:", "Intracerebral haemorrhage, left basal ganglia (ICD-10 I61.0)"],
        ["Procedures:", "CT brain, blood pressure control, physiotherapy"],
        ["Medications:", "Amlodipine 10mg, Labetalol 200mg"],
      ],
      text: [
        "Conservative management; no surgery needed. Neurologically stable for 72 hours; fit for transfer home for rehabilitation.",
      ],
    },
    {
      type: "section",
      heading: "Fitness for transfer",
      fields: [
        ["Fit to Fly:", "Yes, from 2026-10-21"],
        ["Mobility:", "Stretcher"],
        ["Oxygen:", "2 L/min"],
        ["Monitoring:", "Basic (blood pressure, neuro checks)"],
        ["Escort:", "Doctor"],
      ],
    },
    {
      type: "signature",
      caption: "Physician's signature and stamp",
      name: "Dr. Zhang Wei",
      role: "Neurologist · Reg. DEMO-31-0626",
      place: "Shanghai, 2026-10-19",
      stamp: certifiedCopy(PUDONG_INTERNATIONAL, "Shanghai"),
    },
  ],
};

// Rachel Lim's final bill for a dengue admission in Bangkok (CASE-1006),
// billed to the insurer in THB. Overbilled the way tourist-area invoices often
// are: a consultation above the reference, a night more than the stay, a VIP
// suite, a duplicate laboratory line, consumables far above the reference and
// comfort items; the dengue serology has no reference price and is queried.
const rachelFinalInvoice: SampleDoc = {
  file: "final-invoice-rachel-lim-bangkok.pdf",
  dir: "demo-documents",
  lang: "en",
  issuer: SUKHUMVIT_INTERNATIONAL,
  title: "INVOICE",
  subtitle: "Final invoice, inpatient stay",
  meta: [
    ["Invoice No:", "SDI-INV-2026-7731"],
    ["Invoice Date:", "2026-10-13"],
    ["Case:", "CASE-1006"],
  ],
  blocks: [
    patient(RACHEL, [
      ["Policy Number:", "POL-SG-200102"],
      ["Payer:", `${BRAND.name} (direct billing)`],
      ["Currency:", "THB"],
    ]),
    {
      type: "fields",
      title: "Stay",
      left: [
        ["Hospital:", "Sukhumvit Demo International Hospital"],
        ["Attending Physician:", "Dr. Kanya Srisuk"],
        ["Diagnosis:", "Dengue with warning signs (A97.1)"],
      ],
      right: [
        ["Admission Date:", "2026-10-09"],
        ["Discharge Date:", "2026-10-12"],
        ["Room:", "Ward 7, room 712"],
      ],
      split: 0.6,
      labelWidth: 100,
    },
    {
      type: "table",
      heading: "Itemised charges",
      columns: MONEY,
      rows: [
        ["520.020", "Specialist consultation, infectious diseases", "1", "9,800.00", "9,800.00"],
        ["510.120", "Ward accommodation (per night)", "4", "9,500.00", "38,000.00"],
        ["510.160", "VIP suite supplement (per night)", "3", "4,500.00", "13,500.00"],
        ["901.010", "Laboratory: blood count, CRP, electrolytes", "4", "1,950.00", "7,800.00"],
        ["901.010", "Laboratory: blood count, CRP, electrolytes", "4", "1,950.00", "7,800.00"],
        ["901.610", "Dengue NS1 antigen and IgM/IgG serology", "1", "3,200.00", "3,200.00"],
        ["600.200", "Medication and consumables", "1", "14,800.00", "14,800.00"],
        ["520.080", "Physician fees, daily rounds", "4", "4,200.00", "16,800.00"],
        ["950.900", "Telephone and television", "1", "1,200.00", "1,200.00"],
        ["950.920", "Minibar and guest meals", "1", "2,650.00", "2,650.00"],
      ],
      totals: [
        { label: "Subtotal:", value: "115,550.00" },
        { label: "VAT (medical services):", value: "exempt" },
        { label: "Total Amount Due:", value: "115,550.00 THB", strong: true },
      ],
      note: "Direct billing to the travel insurer's assistance company. Payment within 30 days; please quote the invoice number.",
    },
    {
      type: "signature",
      caption: "Billing office stamp",
      name: "Patient Accounts",
      role: "International Patient Services",
      place: "Bangkok, 2026-10-13",
      stamp: patientAccounts(SUKHUMVIT_INTERNATIONAL),
    },
  ],
};

export const SAMPLE_DOCS: SampleDoc[] = [
  aylinMedicalReport,
  aylinInvoice,
  aylinDischarge,
  aylinPrescription,
  jamesMedicalReport,
  jamesInvoice,
  lenaEmergencyReport,
  lenaDischarge,
  lenaInvoice,
  lenaFinalInvoice,
  carlosEstimate,
  oliverEstimate,
  oliverEstimateFax,
  lenaEpikriz,
  lenaFax,
  danielMedicalReport,
  rachelFinalInvoice,
  ...REGION_SAMPLE_DOCS,
];
