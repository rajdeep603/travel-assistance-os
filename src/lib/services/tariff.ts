// ---------------------------------------------------------------------------
// The reference tariff bill review measures invoices against. FICTIONAL DEMO
// DATA: in a pilot this is the client's own schedule (multiples of Turkey's
// SUT tariff, network contract rates, or usual-and-customary prices), kept as
// one versioned ruleset per client.
// ---------------------------------------------------------------------------

export const TARIFF_VERSION = "demo-reference-tariff-2026.1";
export const TARIFF_LABEL = "Fictional demo tariff";

/** A unit price may be this much above the reference before it is reduced to the cap. */
export const PRICE_TOLERANCE = 1.25;

export type TariffCategory =
  | "ADMISSION"
  | "ROOM"
  | "LAB"
  | "IMAGING"
  | "PROCEDURE"
  | "PHYSICIAN"
  | "MEDICATION"
  | "SUPPLIES"
  | "THERAPY"
  | "NON_MEDICAL";

export interface TariffEntry {
  code: string;
  label: string;
  /** Reasonable price per unit, in EUR. Null for items that are never covered. */
  eur: number | null;
  unit: "item" | "night" | "session";
  category: TariffCategory;
  /** Words that identify the item when an invoice has no code (or an unknown one). */
  keywords: string[];
}

const entries: TariffEntry[] = [
  { code: "520.010", label: "Emergency consultation", eur: 160, unit: "item", category: "ADMISSION", keywords: ["emergency consultation"] },
  { code: "520.030", label: "Emergency department admission", eur: 180, unit: "item", category: "ADMISSION", keywords: ["emergency department admission"] },
  { code: "520.050", label: "Emergency cardiology assessment", eur: 700, unit: "item", category: "ADMISSION", keywords: ["cardiology assessment"] },
  { code: "520.080", label: "Physician fees, internal medicine", eur: 120, unit: "item", category: "PHYSICIAN", keywords: ["physician fees"] },
  { code: "520.090", label: "Physician and anaesthesia fees", eur: 600, unit: "item", category: "PHYSICIAN", keywords: ["anaesthesia", "anesthesia"] },
  { code: "510.120", label: "Ward accommodation", eur: 420, unit: "night", category: "ROOM", keywords: ["ward accommodation"] },
  { code: "510.140", label: "Cardiology ward", eur: 800, unit: "night", category: "ROOM", keywords: ["cardiology ward", "coronary care"] },
  { code: "510.160", label: "VIP suite supplement", eur: null, unit: "night", category: "NON_MEDICAL", keywords: ["vip", "suite supplement", "room upgrade"] },
  { code: "600.200", label: "Medication and consumables", eur: 150, unit: "item", category: "MEDICATION", keywords: ["medication and consumables"] },
  { code: "612.040", label: "Below-knee cast", eur: 300, unit: "item", category: "PROCEDURE", keywords: ["cast"] },
  { code: "612.300", label: "Knee arthroscopy, partial meniscectomy", eur: 2400, unit: "item", category: "PROCEDURE", keywords: ["arthroscopy", "meniscectomy"] },
  { code: "801.220", label: "X-ray, ankle (2 views)", eur: 200, unit: "item", category: "IMAGING", keywords: ["x-ray"] },
  { code: "803.410", label: "Coronary CT angiography", eur: 1300, unit: "item", category: "IMAGING", keywords: ["ct angiography"] },
  { code: "803.500", label: "Coronary angiography, diagnostic", eur: 2000, unit: "item", category: "PROCEDURE", keywords: ["coronary angiography"] },
  { code: "901.010", label: "Laboratory: blood count, CRP, electrolytes", eur: 60, unit: "item", category: "LAB", keywords: ["blood count"] },
  { code: "901.220", label: "Laboratory: troponin series, lipids", eur: 350, unit: "item", category: "LAB", keywords: ["troponin"] },
  { code: "901.300", label: "Cardiac monitoring and laboratory", eur: 750, unit: "item", category: "LAB", keywords: ["cardiac monitoring"] },
  { code: "901.430", label: "Laboratory: stool culture", eur: 30, unit: "item", category: "LAB", keywords: ["stool culture"] },
  { code: "930.010", label: "Physiotherapy session", eur: 80, unit: "session", category: "THERAPY", keywords: ["physiotherapy"] },
  { code: "950.110", label: "Crutches (pair)", eur: 55, unit: "item", category: "SUPPLIES", keywords: ["crutches"] },
  { code: "950.120", label: "Knee brace and crutches", eur: 180, unit: "item", category: "SUPPLIES", keywords: ["knee brace"] },
  { code: "950.900", label: "Telephone and television", eur: null, unit: "item", category: "NON_MEDICAL", keywords: ["telephone", "television"] },
  { code: "950.910", label: "Companion meals", eur: null, unit: "item", category: "NON_MEDICAL", keywords: ["companion"] },
  { code: "520.020", label: "Specialist consultation", eur: 120, unit: "item", category: "PHYSICIAN", keywords: ["specialist consultation"] },
  { code: "600.100", label: "Medication", eur: 40, unit: "item", category: "MEDICATION", keywords: ["medication"] },
  { code: "801.230", label: "X-ray, knee (2 views)", eur: 200, unit: "item", category: "IMAGING", keywords: [] },
  { code: "802.310", label: "MRI scan", eur: 420, unit: "item", category: "IMAGING", keywords: ["mri"] },
  { code: "803.120", label: "Optical coherence tomography (OCT)", eur: 140, unit: "item", category: "IMAGING", keywords: ["optical coherence", "oct scan"] },
  { code: "901.050", label: "Laboratory: basic panel", eur: 45, unit: "item", category: "LAB", keywords: ["basic panel"] },
];

export const REFERENCE_TARIFF: ReadonlyMap<string, TariffEntry> = new Map(entries.map((e) => [e.code, e]));

/** Comfort and convenience items: not medical treatment, so never covered. */
const NON_MEDICAL = /\b(vip|suite|upgrade|telephone|phone|television|tv|companion|guest meals?|minibar|toiletr\w*|laundry|parking|wi-?fi|internet|newspaper)\b/i;

export function isNonMedical(description: string): boolean {
  return NON_MEDICAL.test(description);
}

/** The tariff entry for a line: by code first, then by description. */
export function tariffFor(code: string | null, description: string): TariffEntry | null {
  if (code) {
    const hit = REFERENCE_TARIFF.get(code.trim());
    if (hit) return hit;
  }
  const d = description.toLowerCase();
  return entries.find((e) => e.keywords.some((k) => d.includes(k))) ?? null;
}

/** Usual nights in hospital for a diagnosis; null when there's no norm. */
const STAY_NORMS: [RegExp, number][] = [
  [/gastroenteritis|dehydration/i, 2],
  [/angina|chest pain/i, 4],
  [/myocardial infarction|heart attack/i, 6],
  [/meniscus|arthroscop/i, 1],
  [/fracture/i, 2],
  [/appendicitis/i, 3],
  [/pneumonia/i, 5],
];

export function stayNorm(diagnosis: string | null): number | null {
  if (!diagnosis) return null;
  return STAY_NORMS.find(([re]) => re.test(diagnosis))?.[1] ?? null;
}
