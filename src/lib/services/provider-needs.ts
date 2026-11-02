import type { PriceItem, Provider, ProviderKind } from "@prisma/client";
import { ISTANBUL_DISTRICTS, findDistrict } from "./nlu";

// ---------------------------------------------------------------------------
// What a patient needs, in the words a case manager uses, mapped to the
// specialties and kinds of provider that answer it and to the price that
// matters for the estimate; the services a network prices across providers;
// and the places a search can start from (districts, hotels, airports).
// ---------------------------------------------------------------------------

export interface CareNeed {
  id: string;
  label: string;
  /** The chip's text. */
  short: string;
  /** Specialties that answer the need (any of them). */
  specialties: string[];
  /** Kinds of provider that answer it whatever their specialty. */
  kinds: ProviderKind[];
  /** The price that matters for the estimate. */
  item: PriceItem | null;
}

export const CARE_NEEDS: CareNeed[] = [
  { id: "urgent", label: "Urgent care (minor injury or illness)", short: "Urgent care", specialties: ["General Medicine", "Emergency Medicine"], kinds: [], item: "URGENT_CARE_VISIT" },
  { id: "gp", label: "General practitioner", short: "GP", specialties: ["General Medicine", "Internal Medicine"], kinds: [], item: "CONSULTATION" },
  { id: "emergency", label: "Emergency (hospital)", short: "Emergency", specialties: ["Emergency Medicine"], kinds: ["HOSPITAL"], item: "ER_VISIT" },
  { id: "ortho", label: "Orthopedics / sports injury", short: "Orthopedics", specialties: ["Orthopedics"], kinds: [], item: "SPECIALIST_VISIT" },
  { id: "cardio", label: "Cardiology", short: "Cardiology", specialties: ["Cardiology"], kinds: [], item: "SPECIALIST_VISIT" },
  { id: "gastro", label: "Gastroenterology", short: "Gastro", specialties: ["Gastroenterology"], kinds: [], item: "SPECIALIST_VISIT" },
  { id: "derm", label: "Dermatology", short: "Dermatology", specialties: ["Dermatology"], kinds: [], item: "SPECIALIST_VISIT" },
  { id: "neuro", label: "Neurology", short: "Neurology", specialties: ["Neurology"], kinds: [], item: "SPECIALIST_VISIT" },
  { id: "ent", label: "Ear, nose and throat", short: "ENT", specialties: ["Ear, Nose & Throat"], kinds: [], item: "SPECIALIST_VISIT" },
  { id: "eye", label: "Ophthalmology", short: "Eyes", specialties: ["Ophthalmology"], kinds: [], item: "SPECIALIST_VISIT" },
  { id: "gyn", label: "Gynecology / obstetrics", short: "Gynecology", specialties: ["Obstetrics & Gynecology"], kinds: [], item: "SPECIALIST_VISIT" },
  { id: "peds", label: "Pediatrics", short: "Pediatrics", specialties: ["Pediatrics"], kinds: [], item: "CONSULTATION" },
  { id: "dental", label: "Dental", short: "Dental", specialties: ["Dentistry"], kinds: [], item: "DENTAL_EXAM" },
  { id: "video", label: "Video consultation", short: "Video", specialties: [], kinds: ["TELEMEDICINE"], item: "CONSULTATION" },
];

export function needById(id: string | null | undefined): CareNeed | null {
  return CARE_NEEDS.find((n) => n.id === id) ?? null;
}

export function providerMeetsNeed(p: Pick<Provider, "specialty" | "kind">, need: CareNeed): boolean {
  if (need.kinds.includes(p.kind)) return true;
  const s = p.specialty.toLowerCase();
  return need.specialties.some((x) => x.toLowerCase() === s);
}

export const PRICE_ITEM_LABELS: Record<PriceItem, string> = {
  CONSULTATION: "Consultation with a general practitioner",
  SPECIALIST_VISIT: "Specialist consultation",
  URGENT_CARE_VISIT: "Urgent care visit",
  ER_VISIT: "Emergency room visit (facility fee)",
  XRAY: "X-ray (one region)",
  CT_SCAN: "CT scan",
  MRI: "MRI",
  BLOOD_PANEL: "Basic blood panel",
  DENTAL_EXAM: "Dental exam with X-ray",
  OVERNIGHT_STAY: "One night inpatient stay (room only)",
};

/** The network's reference prices (EUR), the estimate when a provider has quoted nothing yet; a rate card scales them. */
export const REFERENCE_PRICES_EUR: Record<PriceItem, number> = {
  CONSULTATION: 60,
  SPECIALIST_VISIT: 95,
  URGENT_CARE_VISIT: 120,
  ER_VISIT: 260,
  XRAY: 70,
  CT_SCAN: 280,
  MRI: 420,
  BLOOD_PANEL: 65,
  DENTAL_EXAM: 80,
  OVERNIGHT_STAY: 450,
};

/** Which prices make sense to ask a provider of this kind and specialty. */
export function priceItemsFor(p: Pick<Provider, "kind" | "specialty">): PriceItem[] {
  if (p.kind === "HOSPITAL") return ["ER_VISIT", "SPECIALIST_VISIT", "XRAY", "OVERNIGHT_STAY"];
  if (p.kind === "TELEMEDICINE") return ["CONSULTATION"];
  const s = p.specialty.toLowerCase();
  if (s === "dentistry") return ["DENTAL_EXAM"];
  if (s === "general medicine" || s === "internal medicine" || s === "pediatrics") return ["CONSULTATION", "BLOOD_PANEL", "XRAY"];
  if (s === "emergency medicine") return ["URGENT_CARE_VISIT", "XRAY", "BLOOD_PANEL"];
  return ["SPECIALIST_VISIT", "XRAY"];
}

/** The price item a quoted label belongs to, for storing what the agent heard or the practice wrote. */
export function priceItemFromLabel(label: string): PriceItem | null {
  const l = label.toLowerCase().trim();
  const hit = (Object.entries(PRICE_ITEM_LABELS) as [PriceItem, string][]).find(([key, text]) => text.toLowerCase() === l || key.toLowerCase() === l);
  if (hit) return hit[0];
  if (/emergency|\ber\b/.test(l)) return "ER_VISIT";
  if (/urgent/.test(l)) return "URGENT_CARE_VISIT";
  if (/specialist/.test(l)) return "SPECIALIST_VISIT";
  if (/dental|dentist/.test(l)) return "DENTAL_EXAM";
  if (/x-?ray|radiograph/.test(l)) return "XRAY";
  if (/\bct\b|tomograph/.test(l)) return "CT_SCAN";
  if (/mri|magnetic/.test(l)) return "MRI";
  if (/blood|lab/.test(l)) return "BLOOD_PANEL";
  if (/night|inpatient|stay|room/.test(l)) return "OVERNIGHT_STAY";
  if (/consult|general|\bgp\b|doctor|visit/.test(l)) return "CONSULTATION";
  return null;
}

export interface CareLocation {
  id: string;
  label: string;
  city: string;
  lat: number;
  lng: number;
  /** Districts come first in the picker; hotels and airports after. */
  kind: "district" | "place";
}

const DISTRICT_NAMES: Record<string, string> = {
  taksim: "Taksim",
  beyoglu: "Beyoglu",
  sisli: "Sisli",
  besiktas: "Besiktas",
  kadikoy: "Kadikoy",
  uskudar: "Uskudar",
  fatih: "Fatih",
  sultanahmet: "Sultanahmet",
  levent: "Levent",
  bakirkoy: "Bakirkoy",
  nisantasi: "Nisantasi",
  atasehir: "Atasehir",
};

/** Where a search can start: Istanbul's districts, then the hotels and airports a traveller is likely to name. */
export const CARE_LOCATIONS: CareLocation[] = [
  ...Object.entries(ISTANBUL_DISTRICTS).map(([key, at]) => ({ id: key, label: `${DISTRICT_NAMES[key] ?? key}, Istanbul`, city: "Istanbul", kind: "district" as const, ...at })),
  { id: "pera-palace", label: "Pera Palace Hotel, Beyoglu", city: "Istanbul", kind: "place", lat: 41.0319, lng: 28.9739 },
  { id: "ciragan", label: "Ciragan Palace Kempinski, Besiktas", city: "Istanbul", kind: "place", lat: 41.0437, lng: 29.016 },
  { id: "four-seasons-sultanahmet", label: "Four Seasons Sultanahmet", city: "Istanbul", kind: "place", lat: 41.0057, lng: 28.979 },
  { id: "hilton-bosphorus", label: "Hilton Istanbul Bosphorus, Harbiye", city: "Istanbul", kind: "place", lat: 41.047, lng: 28.993 },
  { id: "swissotel", label: "Swissotel The Bosphorus, Besiktas", city: "Istanbul", kind: "place", lat: 41.0395, lng: 29.0075 },
  { id: "wyndham-kalamis", label: "Wyndham Grand Kalamis, Kadikoy", city: "Istanbul", kind: "place", lat: 40.973, lng: 29.04 },
  { id: "ist-airport", label: "Istanbul Airport (IST)", city: "Istanbul", kind: "place", lat: 41.2753, lng: 28.7519 },
  { id: "saw-airport", label: "Sabiha Gokcen Airport (SAW)", city: "Istanbul", kind: "place", lat: 40.8986, lng: 29.3092 },
  { id: "rixos-antalya", label: "Rixos Downtown, Antalya", city: "Antalya", kind: "place", lat: 36.884, lng: 30.696 },
  { id: "jw-ankara", label: "JW Marriott, Ankara", city: "Ankara", kind: "place", lat: 39.887, lng: 32.858 },
  { id: "marina-bay-sands", label: "Marina Bay Sands, Singapore", city: "Singapore", kind: "place", lat: 1.2834, lng: 103.8607 },
  { id: "burj-al-arab", label: "Burj Al Arab, Dubai", city: "Dubai", kind: "place", lat: 25.1412, lng: 55.1853 },
  { id: "hard-rock-punta-cana", label: "Hard Rock Hotel, Punta Cana", city: "Punta Cana", kind: "place", lat: 18.6766, lng: -68.386 },
  { id: "steigenberger-hurghada", label: "Steigenberger Al Dau, Hurghada", city: "Hurghada", kind: "place", lat: 27.183, lng: 33.828 },
];

/** The location a free-text description points to: a listed place or hotel, else an Istanbul district named in the text. */
export function resolveLocation(text: string | null | undefined): CareLocation | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const exact = CARE_LOCATIONS.find((l) => l.id === t || l.label.toLowerCase() === t);
  if (exact) return exact;
  const partial = CARE_LOCATIONS.find((l) => l.kind === "place" && l.label.toLowerCase().split(",")[0].includes(t.split(",")[0]));
  if (partial) return partial;
  const district = findDistrict(t)?.toLowerCase();
  return district ? (CARE_LOCATIONS.find((l) => l.id === district) ?? null) : null;
}
