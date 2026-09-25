// ---------------------------------------------------------------------------
// Deterministic NLU dictionaries and helpers shared by the demo AI provider,
// the voice agent and provider search. All geography is Istanbul-centric
// because the platform is demonstrated at ITIC Global.
// ---------------------------------------------------------------------------

export const ISTANBUL_DISTRICTS: Record<string, { lat: number; lng: number }> = {
  taksim: { lat: 41.0369, lng: 28.985 },
  beyoglu: { lat: 41.0322, lng: 28.9779 },
  sisli: { lat: 41.0611, lng: 28.9872 },
  besiktas: { lat: 41.0428, lng: 29.0075 },
  kadikoy: { lat: 40.9906, lng: 29.0271 },
  uskudar: { lat: 41.0226, lng: 29.0155 },
  fatih: { lat: 41.0192, lng: 28.9399 },
  sultanahmet: { lat: 41.0054, lng: 28.9768 },
  levent: { lat: 41.0781, lng: 29.0135 },
  bakirkoy: { lat: 40.9819, lng: 28.8772 },
  nisantasi: { lat: 41.0475, lng: 28.9934 },
  atasehir: { lat: 40.9923, lng: 29.1244 },
};

export const CITIES = ["istanbul", "ankara", "antalya", "izmir", "bodrum"];

export interface SymptomRule {
  keywords: string[];
  symptom: string;
  specialty: string;
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export const SYMPTOM_RULES: SymptomRule[] = [
  { keywords: ["chest pain", "heart", "cardiac"], symptom: "Chest pain", specialty: "Cardiology", urgency: "CRITICAL" },
  { keywords: ["unconscious", "not breathing", "collapsed"], symptom: "Loss of consciousness", specialty: "Emergency Medicine", urgency: "CRITICAL" },
  { keywords: ["stomach pain", "abdominal", "stomach ache", "food poisoning", "vomiting", "nausea", "diarrhea", "diarrhoea"], symptom: "Abdominal pain", specialty: "Gastroenterology", urgency: "HIGH" },
  { keywords: ["broken", "fracture", "sprain", "fell", "fall", "ankle", "wrist injury"], symptom: "Suspected fracture / injury", specialty: "Orthopedics", urgency: "HIGH" },
  { keywords: ["fever", "flu", "cold", "cough", "sore throat", "infection"], symptom: "Fever / infection", specialty: "General Medicine", urgency: "MEDIUM" },
  { keywords: ["tooth", "dental", "toothache"], symptom: "Dental pain", specialty: "Dentistry", urgency: "MEDIUM" },
  { keywords: ["rash", "skin", "allergy", "allergic"], symptom: "Skin reaction / allergy", specialty: "Dermatology", urgency: "MEDIUM" },
  { keywords: ["headache", "migraine", "dizzy", "dizziness"], symptom: "Headache / dizziness", specialty: "Neurology", urgency: "MEDIUM" },
  { keywords: ["pregnan", "obstetric"], symptom: "Pregnancy-related concern", specialty: "Obstetrics & Gynecology", urgency: "HIGH" },
  { keywords: ["eye", "vision"], symptom: "Eye problem", specialty: "Ophthalmology", urgency: "MEDIUM" },
  { keywords: ["ear", "hearing", "sinus"], symptom: "ENT complaint", specialty: "Ear, Nose & Throat", urgency: "LOW" },
  { keywords: ["doctor", "see a doctor", "checkup", "check-up", "unwell", "sick"], symptom: "General medical complaint", specialty: "General Medicine", urgency: "MEDIUM" },
];

export const SPECIALTIES = [
  "General Medicine",
  "Cardiology",
  "Gastroenterology",
  "Orthopedics",
  "Dentistry",
  "Dermatology",
  "Neurology",
  "Emergency Medicine",
  "Obstetrics & Gynecology",
  "Ophthalmology",
  "Ear, Nose & Throat",
  "Pediatrics",
];

export const LANGUAGES = [
  "English",
  "Turkish",
  "German",
  "French",
  "Arabic",
  "Russian",
  "Spanish",
];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function findDistrict(text: string): string | null {
  const t = norm(text);
  for (const district of Object.keys(ISTANBUL_DISTRICTS)) {
    if (t.includes(district)) {
      return district.charAt(0).toUpperCase() + district.slice(1);
    }
  }
  return null;
}

export function findCity(text: string): string | null {
  const t = norm(text);
  for (const city of CITIES) {
    if (t.includes(city)) return city.charAt(0).toUpperCase() + city.slice(1);
  }
  // Any known district implies Istanbul.
  if (findDistrict(text)) return "Istanbul";
  return null;
}

const keywordRe = new Map<string, RegExp>();

function hasKeyword(text: string, keyword: string): boolean {
  let re = keywordRe.get(keyword);
  if (!re) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Word-boundary match ("ear" must not match inside "near"); allow the
    // final word to continue (e.g. "pregnan" → "pregnant"/"pregnancy").
    re = new RegExp(`\\b${escaped}`, "i");
    keywordRe.set(keyword, re);
  }
  return re.test(text);
}

export function matchSymptoms(text: string): SymptomRule[] {
  const t = norm(text);
  const hits: SymptomRule[] = [];
  for (const rule of SYMPTOM_RULES) {
    if (rule.keywords.some((k) => hasKeyword(t, k))) hits.push(rule);
  }
  return hits;
}

export function findSpecialty(text: string): string | null {
  const t = norm(text);
  for (const s of SPECIALTIES) {
    if (t.includes(s.toLowerCase())) return s;
  }
  const hits = matchSymptoms(text);
  return hits.length > 0 ? hits[0].specialty : null;
}

export function findLanguage(text: string): string | null {
  const t = norm(text);
  for (const l of LANGUAGES) {
    if (t.includes(l.toLowerCase())) return l;
  }
  return null;
}

const URGENCY_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as const;

export function maxUrgency(
  rules: SymptomRule[],
  text: string
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  let level: keyof typeof URGENCY_ORDER = rules.length ? rules[0].urgency : "MEDIUM";
  for (const r of rules) {
    if (URGENCY_ORDER[r.urgency] > URGENCY_ORDER[level]) level = r.urgency;
  }
  const t = norm(text);
  const boosters = ["severe", "unbearable", "emergency", "urgent", "extreme", "intense", "worst"];
  if (boosters.some((b) => t.includes(b)) && URGENCY_ORDER[level] < URGENCY_ORDER.HIGH) {
    level = "HIGH";
  }
  return level;
}

/** Resolve relative day expressions to YYYY-MM-DD (local time). */
export function parseDateExpression(text: string, from = new Date()): string | null {
  const t = norm(text);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const add = (days: number) => {
    const d = new Date(from);
    d.setDate(d.getDate() + days);
    return fmt(d);
  };
  if (/\bday after tomorrow\b/.test(t)) return add(2);
  if (/\btomorrow\b/.test(t)) return add(1);
  if (/\btoday\b|\bright now\b|\bas soon as\b|\basap\b/.test(t)) return add(0);
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < weekdays.length; i++) {
    if (t.includes(weekdays[i])) {
      const d = new Date(from);
      let diff = (i - d.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() + diff);
      return fmt(d);
    }
  }
  return null;
}

/** Resolve time expressions to "HH:MM" or a day-part keyword. */
export function parseTimeExpression(text: string): string | null {
  const t = norm(text);
  const clock = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (clock) {
    let h = Number(clock[1]) % 12;
    if (clock[3] === "pm") h += 12;
    return `${String(h).padStart(2, "0")}:${clock[2] ?? "00"}`;
  }
  const hhmm = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (hhmm) return `${hhmm[1].padStart(2, "0")}:${hhmm[2]}`;
  if (t.includes("morning")) return "morning";
  if (t.includes("afternoon")) return "afternoon";
  if (t.includes("evening") || t.includes("tonight")) return "evening";
  return null;
}

export function findExistingCaseRef(text: string): string | null {
  const m = text.match(/\bCASE-\d+\b/i);
  return m ? m[0].toUpperCase() : null;
}

export function findPhone(text: string): string | null {
  const m = text.replace(/[().]/g, "").match(/\+?\d[\d\s-]{7,}\d/);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

export function findEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

const NAME_STOPWORDS = new Set([
  "travelling", "traveling", "visiting", "going", "staying", "looking",
  "in", "at", "near", "not", "here", "a", "an", "the", "and", "but",
  "feeling", "sick", "ill", "unwell", "calling", "sorry", "so", "very",
  "just", "currently", "on", "with", "my", "wife", "husband", "i", "we",
  "well", "fine", "good", "bad", "okay", "ok", "having", "experiencing",
  "suffering", "need", "needs", "help",
]);

/** Extract a person name from phrases like "my name is Sarah Mitchell". */
export function findName(text: string): string | null {
  const m = text.match(
    /(?:my name is|i am|i'm|this is|name's|name is)\s+([a-zA-Z'-]+(?:\s+[a-zA-Z'-]+){0,2})/i
  );
  if (!m) return null;
  const words = m[1]
    .trim()
    .split(/\s+/)
    .filter(
      (w) =>
        !NAME_STOPWORDS.has(w.toLowerCase()) &&
        !findCity(w) &&
        !findDistrict(w) &&
        matchSymptoms(w).length === 0
    );
  if (words.length === 0) return null;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Distance in km between two coordinates (haversine). */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
}
