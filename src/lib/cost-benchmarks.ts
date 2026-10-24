import { round2, toEur } from "@/lib/fx";

// ---------------------------------------------------------------------------
// Is a hospital's cost estimate in the usual range for that treatment in that
// country? Checked before the Letter of Guarantee goes out, so an inflated
// estimate is questioned before it is guaranteed rather than after it is billed.
//
// The ranges are FICTIONAL demo values (EUR per episode, private hospitals that
// treat international patients). A customer's own tariff and claims history
// replace them. Pure, so the decision, the API and the tests share it.
// ---------------------------------------------------------------------------

export const BENCHMARK_SOURCE = "Fictional demo ranges; your own tariff and claims history set the real ones.";

interface Category {
  id: string;
  label: string;
  /** Matched against the diagnosis and treatment lines, in this order. */
  match: RegExp;
  /** Türkiye, EUR. */
  base: [number, number];
  /** Countries where the episode is priced differently from the multiplier. */
  countries?: Record<string, [number, number]>;
}

const CATEGORIES: Category[] = [
  { id: "pci", label: "Coronary stent (PCI) with a coronary care stay", match: /\b(stent|pci|angioplast)/i, base: [8000, 15000] },
  { id: "angiography", label: "Coronary angiography with a coronary care stay", match: /angiograph|unstable angina/i, base: [6000, 13000] },
  { id: "cardiac-observation", label: "Cardiac observation, one or two nights", match: /chest (pain|tight)|cardiac (monitoring|observation)|troponin|coronary syndrome/i, base: [1200, 2800] },
  { id: "knee-arthroscopy", label: "Knee arthroscopy (meniscus), one night", match: /menisc|arthroscop/i, base: [4000, 7500] },
  { id: "fracture-surgery", label: "Fracture surgery (internal fixation)", match: /\borif\b|internal fixation|tibial plateau|fracture.*surgery/i, base: [4500, 9000] },
  { id: "appendectomy", label: "Appendectomy, two or three nights", match: /append/i, base: [3500, 6500] },
  { id: "pneumonia", label: "Pneumonia admission, three to five nights", match: /pneumonia/i, base: [2000, 5000] },
  { id: "dengue", label: "Dengue admission, three or four nights", match: /dengue/i, base: [1500, 4000] },
  { id: "pyelonephritis", label: "Kidney infection admission", match: /pyelonephritis/i, base: [1000, 2800] },
  { id: "head-injury", label: "Head injury: CT scan and overnight observation", match: /head injur|concussion|ct scan of the head/i, base: [900, 2000], countries: { brazil: [900, 2200] } },
  {
    id: "gastroenteritis",
    label: "Gastroenteritis admission, one to three nights",
    match: /gastroenteritis|food poisoning|dehydration/i,
    base: [500, 1500],
    // Resort hospitals price tourists' admissions well above city hospitals.
    countries: { egypt: [1500, 4500] },
  },
  { id: "renal-colic", label: "Renal colic: emergency care and imaging", match: /renal colic|kidney stone/i, base: [400, 1200] },
  { id: "fracture-cast", label: "Fracture: cast and follow-up", match: /fracture|cast\b/i, base: [300, 900] },
];

/** How a country's private care is priced against Türkiye (fictional). */
const COUNTRY_FACTOR: Record<string, number> = {
  turkiye: 1, turkey: 1, egypt: 1.6, tunisia: 1.2, albania: 0.9, thailand: 1.2, "united arab emirates": 2.2,
  brazil: 1.1, "dominican republic": 2, switzerland: 3.5, "united states": 6, usa: 6,
};
const DEFAULT_FACTOR = 1.5;

export type BenchmarkPosition = "below" | "within" | "above" | "well-above";

export interface Benchmark {
  category: string;
  label: string;
  country: string;
  lowEur: number;
  highEur: number;
  estimateEur: number;
  position: BenchmarkPosition;
  /** Estimate against the top of the range, e.g. 1.52. */
  ratio: number;
  source: string;
}

/** More than this times the top of the range needs a person before it is guaranteed. */
export const WELL_ABOVE = 1.5;

export function benchmarkEstimate(input: {
  amount: number;
  currency: string;
  /** Diagnosis and treatment lines. */
  text: string;
  country: string | null | undefined;
}): Benchmark | null {
  const category = CATEGORIES.find((c) => c.match.test(input.text));
  const estimateEur = toEur(input.amount, input.currency);
  if (!category || estimateEur == null || !input.country) return null;
  const country = input.country.trim();
  const key = country.toLowerCase();
  const factor = COUNTRY_FACTOR[key] ?? DEFAULT_FACTOR;
  const [low, high] = category.countries?.[key] ?? [category.base[0] * factor, category.base[1] * factor];
  const ratio = estimateEur / high;
  const position: BenchmarkPosition = estimateEur < low ? "below" : estimateEur <= high ? "within" : ratio <= WELL_ABOVE ? "above" : "well-above";
  return {
    category: category.id,
    label: category.label,
    country: country === "Turkiye" ? "Türkiye" : country,
    lowEur: Math.round(low / 100) * 100,
    highEur: Math.round(high / 100) * 100,
    estimateEur: round2(estimateEur),
    position,
    ratio: round2(ratio),
    source: BENCHMARK_SOURCE,
  };
}

/** "52% above the usual range": how far over the top of the range. */
export function overRange(b: Benchmark): string {
  return `${Math.round((b.ratio - 1) * 100)}% above the usual range`;
}
