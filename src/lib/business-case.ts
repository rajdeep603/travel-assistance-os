// ---------------------------------------------------------------------------
// Business case: what the platform would free up in a visitor's operation.
// Pure arithmetic over the visitor's own volumes and a handful of editable
// assumptions — no I/O, so the page recomputes on every keystroke and the
// unit tests pin the formula. Percentages are whole numbers (60 = 60 %);
// money is EUR.
// ---------------------------------------------------------------------------

import { BRAND, POWERED_BY } from "./brand";
import { formatMoney, formatMoneyExact } from "./format";
import { DEMO_FX_TO_EUR } from "./fx";
import { PILOT_DAYS, pilotPlan, type PilotPlan } from "./pilots";
import { addDays, formatPlainDate } from "./time";

export const CURRENCY = "EUR";

/** The visitor's operation, per month. */
export interface OperationInputs {
  monthlyCases: number;
  monthlyCalls: number;
  /** Share of calls outside office hours, 0–100. */
  afterHoursCallPct: number;
  callMinutes: number;
  monthlyClaims: number;
  claimReviewMinutes: number;
  monthlyLetters: number;
  /** Time to prepare and send one Letter of Guarantee today. */
  letterHours: number;
  monthlyInbound: number;
  inboundMinutes: number;
  /** Loaded cost of one agent hour, EUR. */
  costPerHour: number;
  /** Productive hours of one full-time agent a month (FTE conversion). */
  productiveHoursPerMonth: number;
}

/** What the platform takes off people's desks, 0–100 each. Assumptions, not claims. */
export interface Assumptions {
  /** Calls the AI handles end-to-end, with no person on the line. */
  aiHandledCallPct: number;
  /** Time saved on the calls a person still takes (AI triage + summary). */
  assistedCallTimeSavedPct: number;
  claimTimeSavedPct: number;
  letterTimeSavedPct: number;
  /** E-mails and faxes read, matched and answered without a person. */
  inboundAutomatedPct: number;
}

export type Area = "calls" | "inbound" | "claims" | "letters";

// ---------------------------------------------------------------------------
// Scope: a quotation can leave services out. Each service is a line of the
// running cost further down; leaving one out drops its line, and the hours
// its area would have freed go with it, so a quotation never claims a saving
// from a service it doesn't sell.
// ---------------------------------------------------------------------------

export const COST_ITEMS = ["voice", "phone", "notes", "inbound", "claims", "letters", "cloud"] as const;
export type CostItem = (typeof COST_ITEMS)[number];

/** The service each area's saving depends on. */
const AREA_SERVICE: Record<Area, CostItem> = { calls: "voice", inbound: "inbound", claims: "claims", letters: "letters" };

/** Lines that go with a service when it is left out: no voice AI, no minutes on its line and no transcripts to write notes from. */
const CARRIED: Partial<Record<CostItem, readonly CostItem[]>> = { voice: ["phone", "notes"] };

/** The services left out, dependents included, in the order of the quotation. */
export function excludedServices(excluded: readonly CostItem[] = []): CostItem[] {
  const out = new Set(excluded.flatMap((item) => [item, ...(CARRIED[item] ?? [])]));
  return COST_ITEMS.filter((item) => out.has(item));
}

const isSome = <T,>(value: T | null): value is T => value !== null;

export interface AreaResult {
  area: Area;
  label: string;
  /** Items per month (calls, messages, claims, letters). */
  volume: number;
  hoursToday: number;
  hoursFreed: number;
  /** EUR per month. */
  saving: number;
}

export interface BusinessCaseResult {
  /** The services this case leaves out (a quotation's scope), dependents included; empty for the whole platform. */
  excluded: CostItem[];
  /** The areas the services in scope address. */
  areas: AreaResult[];
  hoursToday: number;
  hoursFreed: number;
  /** hoursFreed / hoursToday, 0–1. */
  shareFreed: number;
  fte: number;
  monthlySaving: number;
  annualSaving: number;
  /** Monthly saving spread over the assistance cases; 0 without cases. */
  savingPerCase: number;
  /** Calls outside office hours: the AI picks up every one of them at once. */
  afterHoursCalls: number;
  letterMinutesToday: number;
  letterMinutesAutomated: number;
}

export interface Preset {
  id: string;
  label: string;
  inputs: OperationInputs;
}

// Conservative on purpose: the visitor should find them easy to believe.
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  aiHandledCallPct: 60,
  assistedCallTimeSavedPct: 30,
  claimTimeSavedPct: 50,
  letterTimeSavedPct: 80,
  inboundAutomatedPct: 70,
};

// Modest, round figures for typical visitors, smallest first.
export const PRESETS: readonly Preset[] = [
  {
    id: "specialist",
    label: "Specialist travel insurer",
    inputs: {
      monthlyCases: 300,
      monthlyCalls: 1_200,
      afterHoursCallPct: 40,
      callMinutes: 6,
      monthlyClaims: 400,
      claimReviewMinutes: 15,
      monthlyLetters: 60,
      letterHours: 1.5,
      monthlyInbound: 800,
      inboundMinutes: 5,
      costPerHour: 28,
      productiveHoursPerMonth: 140,
    },
  },
  {
    id: "regional",
    label: "Regional assistance company",
    inputs: {
      monthlyCases: 1_500,
      monthlyCalls: 6_000,
      afterHoursCallPct: 35,
      callMinutes: 6,
      monthlyClaims: 2_000,
      claimReviewMinutes: 15,
      monthlyLetters: 300,
      letterHours: 1.5,
      monthlyInbound: 4_000,
      inboundMinutes: 5,
      costPerHour: 30,
      productiveHoursPerMonth: 140,
    },
  },
  {
    // Six alarm centres across Singapore, Malaysia, Thailand, the Philippines,
    // Japan and China: more volume than a regional company, at a blended
    // Asia-Pacific staff cost.
    id: "apac",
    label: "Asia-Pacific assistance group",
    inputs: {
      monthlyCases: 4_200,
      monthlyCalls: 16_000,
      afterHoursCallPct: 40,
      callMinutes: 7,
      monthlyClaims: 3_000,
      claimReviewMinutes: 15,
      monthlyLetters: 900,
      letterHours: 1.5,
      monthlyInbound: 11_000,
      inboundMinutes: 5,
      costPerHour: 18,
      productiveHoursPerMonth: 150,
    },
  },
  {
    id: "large",
    label: "Large insurer",
    inputs: {
      monthlyCases: 8_000,
      monthlyCalls: 30_000,
      afterHoursCallPct: 30,
      callMinutes: 7,
      monthlyClaims: 12_000,
      claimReviewMinutes: 12,
      monthlyLetters: 1_500,
      letterHours: 1.5,
      monthlyInbound: 20_000,
      inboundMinutes: 5,
      costPerHour: 35,
      productiveHoursPerMonth: 140,
    },
  },
];

export const DEFAULT_INPUTS: OperationInputs = PRESETS[1].inputs;

/** A count or duration: blanks, typos and negatives count as zero. */
function amount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** A percentage as a 0–1 fraction, clamped. */
function share(pct: number): number {
  return Math.min(1, amount(pct) / 100);
}

export function calculateBusinessCase(
  inputs: OperationInputs,
  assumptions: Assumptions,
  excluded: readonly CostItem[] = []
): BusinessCaseResult {
  const costPerHour = amount(inputs.costPerHour);
  const left = excludedServices(excluded);
  const out = new Set(left);

  // Calls: the AI's share goes entirely; the rest gets faster with triage + summary.
  const aiCalls = share(assumptions.aiHandledCallPct);
  const callShareFreed = aiCalls + (1 - aiCalls) * share(assumptions.assistedCallTimeSavedPct);

  // Hours an area takes today (volume × handling time), and the share freed.
  const measure = (
    area: Area,
    label: string,
    volume: number,
    minutesEach: number,
    shareFreed: number
  ): AreaResult => {
    const hoursToday = (amount(volume) * amount(minutesEach)) / 60;
    const hoursFreed = hoursToday * shareFreed;
    return {
      area,
      label,
      volume: amount(volume),
      hoursToday,
      hoursFreed,
      saving: hoursFreed * costPerHour,
    };
  };

  const areas = [
    measure("calls", "Calls", inputs.monthlyCalls, inputs.callMinutes, callShareFreed),
    measure(
      "inbound",
      "E-mail & fax",
      inputs.monthlyInbound,
      inputs.inboundMinutes,
      share(assumptions.inboundAutomatedPct)
    ),
    measure(
      "claims",
      "Claims",
      inputs.monthlyClaims,
      inputs.claimReviewMinutes,
      share(assumptions.claimTimeSavedPct)
    ),
    measure(
      "letters",
      "Letters of Guarantee",
      inputs.monthlyLetters,
      amount(inputs.letterHours) * 60,
      share(assumptions.letterTimeSavedPct)
    ),
  ].filter((a) => !out.has(AREA_SERVICE[a.area]));

  const hoursToday = areas.reduce((sum, a) => sum + a.hoursToday, 0);
  const hoursFreed = areas.reduce((sum, a) => sum + a.hoursFreed, 0);
  const monthlySaving = hoursFreed * costPerHour;
  const productiveHours = amount(inputs.productiveHoursPerMonth);
  const cases = amount(inputs.monthlyCases);
  const letterMinutesToday = amount(inputs.letterHours) * 60;

  return {
    excluded: left,
    areas,
    hoursToday,
    hoursFreed,
    shareFreed: hoursToday > 0 ? hoursFreed / hoursToday : 0,
    fte: productiveHours > 0 ? hoursFreed / productiveHours : 0,
    monthlySaving,
    annualSaving: monthlySaving * 12,
    savingPerCase: cases > 0 ? monthlySaving / cases : 0,
    // Without the voice AI nobody picks up at night; without the letters service a letter takes as long as today.
    afterHoursCalls: out.has("voice") ? 0 : amount(inputs.monthlyCalls) * share(inputs.afterHoursCallPct),
    letterMinutesToday,
    letterMinutesAutomated: out.has("letters") ? letterMinutesToday : letterMinutesToday * (1 - share(assumptions.letterTimeSavedPct)),
  };
}

// ---------------------------------------------------------------------------
// Wording, shared by the page and the copied summary so they never disagree.
// ---------------------------------------------------------------------------

export const DISCLAIMER = "Estimates for discussion, based on the assumptions shown";

export function formatCount(value: number, decimals = 0): string {
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** 1,243 → 1,240; 408,312 → 408,000: "about" figures for spoken sentences. */
export function roughly(value: number): number {
  if (value < 1_000) return Math.round(value);
  const unit = 10 ** (Math.floor(Math.log10(value)) - 2);
  return Math.round(value / unit) * unit;
}

/** 18 → "18 min", 90 → "1.5 h", 0.4 → "under a minute". */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${formatCount(hours, Number.isInteger(hours) ? 0 : 1)} h`;
}

export function headline(result: BusinessCaseResult): string {
  if (result.hoursFreed < 1) {
    return `Enter your monthly volumes to see what ${BRAND.name} would free up in your operation.`;
  }
  // Same figure as the hours card beside the headline; the yearly amount is rounded.
  const hours = formatCount(Math.round(result.hoursFreed));
  const fte = formatCount(result.fte, 1);
  const annual = formatMoney(roughly(result.annualSaving), CURRENCY);
  return `With these numbers, ${BRAND.name} would free about ${hours} agent hours a month — roughly ${fte} full-time staff, worth about ${annual} a year.`;
}

/** Plain text for the follow-up e-mail: inputs, assumptions, results. */
export function buildSummary(
  inputs: OperationInputs,
  assumptions: Assumptions,
  result: BusinessCaseResult
): string {
  const n = (v: number) => amount(v).toLocaleString("en-GB", { maximumFractionDigits: 1 });
  const pct = (v: number) => `${formatCount(share(v) * 100)}%`;
  const eur = (v: number) => formatMoney(Math.round(v), CURRENCY);
  const byArea = result.areas
    .map((a) => `${a.label} ${formatCount(a.hoursFreed)} h (${eur(a.saving)})`)
    .join(" · ");
  // A service left out of the quotation takes its volume, assumption and result lines with it.
  const out = new Set(result.excluded);
  const when = (item: CostItem, line: string): string | null => (out.has(item) ? null : line);
  const assumed = [
    when("voice", `- Calls the AI handles end-to-end: ${pct(assumptions.aiHandledCallPct)}`),
    when("voice", `- Time saved on calls a person still takes: ${pct(assumptions.assistedCallTimeSavedPct)}`),
    when("claims", `- Claim review time saved: ${pct(assumptions.claimTimeSavedPct)}`),
    when("letters", `- Letter of Guarantee preparation time saved: ${pct(assumptions.letterTimeSavedPct)}`),
    when("inbound", `- E-mails & faxes handled automatically: ${pct(assumptions.inboundAutomatedPct)}`),
  ].filter(isSome);

  return [
    `${BRAND.name} business case — estimate`,
    "",
    "Your operation (per month)",
    `- Assistance cases: ${n(inputs.monthlyCases)}`,
    when("voice", `- Inbound calls: ${n(inputs.monthlyCalls)} (${pct(inputs.afterHoursCallPct)} outside office hours, ${n(inputs.callMinutes)} min each)`),
    when("inbound", `- E-mails & faxes: ${n(inputs.monthlyInbound)} (${n(inputs.inboundMinutes)} min each)`),
    when("claims", `- Claims: ${n(inputs.monthlyClaims)} (${n(inputs.claimReviewMinutes)} min review each)`),
    when("letters", `- Letters of Guarantee: ${n(inputs.monthlyLetters)} (${formatDuration(result.letterMinutesToday)} each today)`),
    `- Loaded cost per agent hour: ${eur(amount(inputs.costPerHour))}; ${n(inputs.productiveHoursPerMonth)} productive hours per agent a month`,
    "",
    ...(assumed.length ? ["Assumptions", ...assumed, ""] : []),
    "Results",
    `- Agent hours freed: ${formatCount(result.hoursFreed)} a month (about ${formatCount(result.fte, 1)} full-time staff)`,
    `- Cost saved: ${eur(result.monthlySaving)} a month, ${eur(result.annualSaving)} a year`,
    when("voice", `- After-hours calls answered instantly: ${formatCount(result.afterHoursCalls)} a month`),
    when("letters", `- Letter of Guarantee turnaround: ${formatDuration(result.letterMinutesToday)} today, ${formatDuration(result.letterMinutesAutomated)} with ${BRAND.name}`),
    byArea ? `- By area: ${byArea}` : null,
    "",
    `${DISCLAIMER}. ${BRAND.name} · ${POWERED_BY}`,
  ]
    .filter(isSome)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Cost containment: the medical-spend side, kept apart from the labour
// figures above. Bill review of hospital invoices against a reference tariff
// usually saves far more than the hours it frees; the defaults are
// deliberately conservative.
// ---------------------------------------------------------------------------

export interface CostContainmentInputs {
  /** Hospital and clinic bills paid abroad a year, EUR. */
  annualMedicalSpend: number;
  /** Share of that spend whose bills go through review, 0–100. */
  reviewedPct: number;
  /** Average saving on a reviewed bill, 0–100. */
  savingPct: number;
}

export const DEFAULT_COST_CONTAINMENT: CostContainmentInputs = {
  annualMedicalSpend: 12_000_000,
  reviewedPct: 60,
  savingPct: 8,
};

/** Medical spend abroad a year for each preset. */
export const PRESET_MEDICAL_SPEND: Record<string, number> = {
  specialist: 2_500_000,
  regional: 12_000_000,
  apac: 40_000_000,
  large: 60_000_000,
};

export interface CostContainmentResult {
  reviewedSpend: number;
  annualSaving: number;
  monthlySaving: number;
}

export function calculateCostContainment(inputs: CostContainmentInputs): CostContainmentResult {
  const reviewedSpend = amount(inputs.annualMedicalSpend) * share(inputs.reviewedPct);
  const annualSaving = reviewedSpend * share(inputs.savingPct);
  return { reviewedSpend, annualSaving, monthlySaving: annualSaving / 12 };
}

/** The copied summary, with the cost-containment section before the closing line. */
export function withCostContainment(summary: string, inputs: CostContainmentInputs, result: CostContainmentResult): string {
  const lines = summary.split("\n");
  const closing = lines.pop() ?? "";
  const eur = (v: number) => formatMoney(Math.round(v), CURRENCY);
  const pct = (v: number) => `${formatCount(share(v) * 100)}%`;
  return [
    ...lines,
    "Medical spend (cost containment, per year)",
    `- Medical spend abroad: ${eur(amount(inputs.annualMedicalSpend))}`,
    `- Bills reviewed line by line: ${pct(inputs.reviewedPct)} (${eur(result.reviewedSpend)})`,
    `- Average saving on a reviewed bill: ${pct(inputs.savingPct)}`,
    `- Medical spend saved: ${eur(result.annualSaving)} a year (${eur(result.monthlySaving)} a month)`,
    "",
    closing,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Running cost: what the AI itself costs a month at pay-as-you-go prices, so
// the labour saving can be shown net of it. The defaults are the list prices
// behind this demo in October 2026, at the demo rate of $1 = €0.92:
// - voice AI: xAI Grok Voice 3.0, speech to speech, $0.08 a minute;
// - phone line: Twilio, US local number, $0.0085 a minute inbound plus
//   $0.0044 for the audio stream to the voice AI;
// - document AI: Claude Opus 5.5, $4 per million tokens read and $20 per
//   million written, at the token counts below;
// - cloud hosting: a lean production setup in one region (two small app
//   servers, a managed database, storage and backups, about $130 a month),
//   kept on the low side on purpose.
// The page and the summary never name the vendors. Every price is editable,
// so a presenter can put in the visitor's own quote. The platform licence is
// not part of it.
// ---------------------------------------------------------------------------

const USD_TO_EUR = DEMO_FX_TO_EUR.USD;
const MODEL_USD_PER_MILLION = { read: 4, written: 20 };

/** Tokens read and written for one item, from the AI calls each workflow makes. */
const TOKENS_PER_ITEM = {
  // Read (OCR for a scan), classify, extract the attachment, analyse the request, translate the reply.
  message: { read: 10_000, written: 3_000 },
  // Read, classify and extract about three documents, then summarise the claim.
  claim: { read: 14_000, written: 4_000 },
  // Read and extract the cost estimate; the decision itself is rules, not AI.
  letter: { read: 6_000, written: 2_000 },
  // The transcript in, the case note out.
  callNote: { read: 3_000, written: 600 },
};

const toThousandths = (n: number) => Math.round(n * 1000) / 1000;
const modelEur = ({ read, written }: { read: number; written: number }) =>
  toThousandths(((read * MODEL_USD_PER_MILLION.read + written * MODEL_USD_PER_MILLION.written) / 1_000_000) * USD_TO_EUR);

/** What the AI costs per use, EUR. */
export interface RunningCostPrices {
  /** Voice AI, a minute it is on a call. */
  voicePerMinute: number;
  /** The phone line while the voice AI is on the call: the inbound minute and the audio stream. */
  phonePerMinute: number;
  /** Minutes the voice AI spends on a call it hands to a person: triage, then a warm transfer. */
  handoverMinutes: number;
  perCallNote: number;
  perMessage: number;
  perClaim: number;
  perLetter: number;
  /** Servers, database, storage and backups, a month. */
  cloudPerMonth: number;
}

export const DEFAULT_RUNNING_COST_PRICES: RunningCostPrices = {
  voicePerMinute: toThousandths(0.08 * USD_TO_EUR),
  phonePerMinute: toThousandths((0.0085 + 0.0044) * USD_TO_EUR),
  handoverMinutes: 1.5,
  perCallNote: modelEur(TOKENS_PER_ITEM.callNote),
  perMessage: modelEur(TOKENS_PER_ITEM.message),
  perClaim: modelEur(TOKENS_PER_ITEM.claim),
  perLetter: modelEur(TOKENS_PER_ITEM.letter),
  cloudPerMonth: 120,
};

/** The price each running-cost line is worked out from. */
export const LINE_PRICE: Record<CostItem, keyof RunningCostPrices> = {
  voice: "voicePerMinute",
  phone: "phonePerMinute",
  notes: "perCallNote",
  inbound: "perMessage",
  claims: "perClaim",
  letters: "perLetter",
  cloud: "cloudPerMonth",
};

export interface CostLine {
  item: CostItem;
  label: string;
  /** Minutes or items a month; 1 for a monthly charge. */
  volume: number;
  unit: "min" | "item" | "month";
  /** EUR per minute, item or month. */
  price: number;
  /** EUR a month. */
  cost: number;
}

export interface RunningCostResult {
  lines: CostLine[];
  /** Calls a month the AI closes itself, and calls it hands to a person. */
  callsClosed: number;
  callsHandedOver: number;
  /** Minutes the voice AI spends on a call it hands over (no longer than the call). */
  handoverMinutes: number;
  /** Minutes a month the voice AI is on a call. */
  voiceMinutes: number;
  monthlyCost: number;
  annualCost: number;
  /** Monthly cost spread over the assistance cases; 0 without cases. */
  costPerCase: number;
  /** The labour saving less the running cost; negative when the AI costs more than it frees. */
  netMonthlySaving: number;
  netAnnualSaving: number;
  /** Euros of agent time freed for every euro the AI costs; 0 when it costs nothing. */
  returnPerEuro: number;
  /** A minute on the phone: the voice AI and its line, against an agent at the loaded hourly cost. */
  aiMinuteCost: number;
  agentMinuteCost: number;
}

export function calculateRunningCost(
  inputs: OperationInputs,
  assumptions: Assumptions,
  prices: RunningCostPrices,
  result: BusinessCaseResult = calculateBusinessCase(inputs, assumptions)
): RunningCostResult {
  // The voice AI answers every call: it stays on the ones it closes and hands
  // the rest over after triage. Left out of the quotation, it answers none.
  const out = new Set(result.excluded);
  const calls = out.has("voice") ? 0 : amount(inputs.monthlyCalls);
  const callMinutes = amount(inputs.callMinutes);
  const callsClosed = calls * share(assumptions.aiHandledCallPct);
  const callsHandedOver = calls - callsClosed;
  const handoverMinutes = Math.min(callMinutes, amount(prices.handoverMinutes));
  const voiceMinutes = callsClosed * callMinutes + callsHandedOver * handoverMinutes;

  const line = (item: CostItem, label: string, volume: number, unit: CostLine["unit"], price: number): CostLine => ({
    item,
    label,
    volume,
    unit,
    price: amount(price),
    cost: volume * amount(price),
  });
  const lines = [
    line("voice", "Voice AI on calls", voiceMinutes, "min", prices.voicePerMinute),
    line("phone", "Phone line", voiceMinutes, "min", prices.phonePerMinute),
    line("notes", "Call notes", calls, "item", prices.perCallNote),
    line("inbound", "E-mails & faxes read", amount(inputs.monthlyInbound), "item", prices.perMessage),
    line("claims", "Claims checked", amount(inputs.monthlyClaims), "item", prices.perClaim),
    line("letters", "Letters of Guarantee drafted", amount(inputs.monthlyLetters), "item", prices.perLetter),
    line("cloud", "Cloud hosting", 1, "month", prices.cloudPerMonth),
  ].filter((l) => !out.has(l.item));

  const monthlyCost = lines.reduce((sum, l) => sum + l.cost, 0);
  const cases = amount(inputs.monthlyCases);
  return {
    lines,
    callsClosed,
    callsHandedOver,
    handoverMinutes,
    voiceMinutes,
    monthlyCost,
    annualCost: monthlyCost * 12,
    costPerCase: cases > 0 ? monthlyCost / cases : 0,
    netMonthlySaving: result.monthlySaving - monthlyCost,
    netAnnualSaving: (result.monthlySaving - monthlyCost) * 12,
    returnPerEuro: monthlyCost > 0 ? result.monthlySaving / monthlyCost : 0,
    aiMinuteCost: amount(prices.voicePerMinute) + amount(prices.phonePerMinute),
    agentMinuteCost: amount(inputs.costPerHour) / 60,
  };
}

/** How a line's cost is worked out: "25,200 min × €0.074", "4,000 × €0.092". */
export function costBasis(line: CostLine): string {
  if (line.unit === "month") return "Servers, database, storage and backups";
  return `${formatCount(line.volume)}${line.unit === "min" ? " min" : ""} × ${formatRate(line.price)}`;
}

/** €0.074, €0.12: per-minute and per-item prices, to the tenth of a cent. */
export function formatRate(eur: number): string {
  return `€${eur.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
}

/** The headline, adding the saving after the AI's running cost. */
export function netHeadline(result: BusinessCaseResult, running: RunningCostResult): string {
  const base = headline(result);
  if (result.hoursFreed < 1 || running.monthlyCost <= 0) return base;
  const stem = base.replace(/\.$/, "");
  if (running.netAnnualSaving <= 0) {
    return `${stem}, which doesn't cover the ${formatMoney(roughly(running.annualCost), CURRENCY)} a year the AI costs to run.`;
  }
  return `${stem}, or ${formatMoney(roughly(running.netAnnualSaving), CURRENCY)} after the AI's running costs.`;
}

/** The copied summary, with the running-cost section before the closing line. */
export function withRunningCost(summary: string, running: RunningCostResult): string {
  const lines = summary.split("\n");
  const closing = lines.pop() ?? "";
  const eur = (v: number) => formatMoney(Math.round(v), CURRENCY);
  const returnLine =
    running.returnPerEuro > 0 ? ` (${formatMoney(Math.round(running.returnPerEuro), CURRENCY)} of agent time freed for every €1 of AI)` : "";
  return [
    ...lines,
    "AI running cost (per month, pay-as-you-go)",
    ...running.lines.map((l) =>
      l.unit === "month" ? `- ${l.label} (${costBasis(l).toLowerCase()}): ${eur(l.cost)}` : `- ${l.label}: ${costBasis(l)} = ${eur(l.cost)}`
    ),
    `- Total: ${eur(running.monthlyCost)} a month, ${eur(running.annualCost)} a year${
      running.costPerCase > 0 ? ` (${formatMoneyExact(running.costPerCase, CURRENCY)} per case)` : ""
    }`,
    `- Net saving after AI costs: ${eur(running.netMonthlySaving)} a month, ${eur(running.netAnnualSaving)} a year${returnLine}`,
    "",
    closing,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Quotation: the services at the running cost above, Sthiram's own one-time
// service charges (setup, integration, training…), who it is for, and how
// soon the net saving pays the one-time part back.
// ---------------------------------------------------------------------------

export interface ServiceItem {
  description: string;
  /** EUR, once; 0 shows the service as included. */
  amount: number;
}

export interface QuoteDetails {
  customerName: string;
  companyName: string;
  email: string;
  phone: string;
  /** Sthiram's one-time service charges. */
  services: ServiceItem[];
  /** The 60-day pilot proposed (an id from src/lib/pilots.ts); empty or absent for none. */
  pilot?: string;
  /** Services left out of this quotation (see COST_ITEMS); absent for all of them. */
  excluded?: CostItem[];
}

export const EMPTY_QUOTE: QuoteDetails = { customerName: "", companyName: "", email: "", phone: "", services: [] };

/** How long a quotation holds. */
export const QUOTE_VALID_DAYS = 30;

export interface QuoteResult {
  customerName: string;
  companyName: string;
  email: string;
  phone: string;
  /** "Aylin Kaya, Anatolia Assist": the customer and the company, whichever are given. */
  preparedFor: string;
  /** The services with a description, in the order entered. */
  services: ServiceItem[];
  pilot: PilotPlan | null;
  oneTimeTotal: number;
  monthlyRunningCost: number;
  /** One-time services plus twelve months of running cost. */
  firstYearCost: number;
  /** Months of net saving that recover the one-time cost: 0 with nothing to recover, null when the saving never does. */
  paybackMonths: number | null;
}

export function calculateQuote(quote: QuoteDetails, running: RunningCostResult): QuoteResult {
  const services = quote.services
    .map((s) => ({ description: s.description.trim(), amount: amount(s.amount) }))
    .filter((s) => s.description);
  const oneTimeTotal = services.reduce((sum, s) => sum + s.amount, 0);
  const customerName = quote.customerName.trim();
  const companyName = quote.companyName.trim();
  return {
    customerName,
    companyName,
    email: quote.email.trim(),
    phone: quote.phone.trim(),
    preparedFor: [customerName, companyName].filter(Boolean).join(", "),
    services,
    pilot: pilotPlan(quote.pilot),
    oneTimeTotal,
    monthlyRunningCost: running.monthlyCost,
    firstYearCost: oneTimeTotal + running.annualCost,
    paybackMonths: oneTimeTotal === 0 ? 0 : running.netMonthlySaving > 0 ? oneTimeTotal / running.netMonthlySaving : null,
  };
}

/** "Pays back in 1.4 months", for the page, the PDF and the summary alike. */
export function formatPayback(months: number | null): string {
  if (months === null) return "The net saving doesn't pay back the one-time cost";
  if (months === 0) return "No one-time cost to pay back";
  if (months <= 1) return "Pays back within the first month";
  return `Pays back in ${formatCount(months, months < 10 ? 1 : 0)} months`;
}

/**
 * "Q-20261017-3FA2C1": the date and a short hash of everything quoted, so the
 * same quotation has the same number whether previewed, downloaded, e-mailed
 * or submitted as a lead.
 */
export function quoteNumber(input: BusinessCaseInput, date: string): string {
  let hash = 0x811c9dc5;
  for (const ch of JSON.stringify(input)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `Q-${date.replace(/-/g, "")}-${(hash & 0xffffff).toString(16).toUpperCase().padStart(6, "0")}`;
}

/** The copied summary with the quotation: who it is for after the title, the services before the closing line. */
export function withQuote(summary: string, quote: QuoteResult): string {
  const lines = summary.split("\n");
  if (quote.preparedFor) lines.splice(1, 0, `Prepared for ${quote.preparedFor}`);
  if (!quote.services.length && !quote.pilot) return lines.join("\n");
  const closing = lines.pop() ?? "";
  const eur = (v: number) => formatMoney(Math.round(v), CURRENCY);
  const pilot = quote.pilot
    ? [`${PILOT_DAYS}-day pilot: ${quote.pilot.label}`, quote.pilot.scope, ...quote.pilot.measures.map((m) => `- ${m}`), ""]
    : [];
  if (!quote.services.length) return [...lines, ...pilot, closing].join("\n");
  return [
    ...lines,
    ...pilot,
    "Service charges (one-time)",
    ...quote.services.map((s) => `- ${s.description}: ${s.amount > 0 ? eur(s.amount) : "included"}`),
    `- Total one-time: ${eur(quote.oneTimeTotal)}`,
    `- First year with running costs: ${eur(quote.firstYearCost)}. ${formatPayback(quote.paybackMonths)}.`,
    "",
    closing,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The whole business case from what the presenter entered: the page, the PDF
// and the e-mail all build from this, so they never disagree.
// ---------------------------------------------------------------------------

export interface BusinessCaseInput {
  operation: OperationInputs;
  assumptions: Assumptions;
  prices: RunningCostPrices;
  costContainment: CostContainmentInputs;
  quote: QuoteDetails;
}

export interface BusinessCaseReport {
  input: BusinessCaseInput;
  result: BusinessCaseResult;
  running: RunningCostResult;
  cost: CostContainmentResult;
  quote: QuoteResult;
  headline: string;
  /** Plain text, as copied and as the body of the e-mail. */
  summary: string;
}

export function businessCaseReport(input: BusinessCaseInput): BusinessCaseReport {
  const result = calculateBusinessCase(input.operation, input.assumptions, input.quote.excluded);
  const running = calculateRunningCost(input.operation, input.assumptions, input.prices, result);
  const cost = calculateCostContainment(input.costContainment);
  const quote = calculateQuote(input.quote, running);
  const summary = withQuote(
    withCostContainment(withRunningCost(buildSummary(input.operation, input.assumptions, result), running), input.costContainment, cost),
    quote
  );
  return { input, result, running, cost, quote, headline: netHeadline(result, running), summary };
}

// ---------------------------------------------------------------------------
// The quotation's own wording, shared by the on-screen preview and the PDF so
// the two always say the same thing.
// ---------------------------------------------------------------------------

export interface QuoteMeta {
  /** "Q-20261017-3FA2C1" */
  number: string;
  /** YYYY-MM-DD */
  date: string;
  validUntil: string;
}

export function quoteMeta(input: BusinessCaseInput, date: string, number = quoteNumber(input, date)): QuoteMeta {
  return { number, date, validUntil: addDays(date, QUOTE_VALID_DAYS) };
}

/** "17 October 2026" */
export const longDate = (date: string) => formatPlainDate(date, { day: "numeric", month: "long", year: "numeric" });

const quoteEur = (n: number) => formatMoney(Math.round(n), CURRENCY);
const quotePct = (n: number) => `${formatCount(share(n) * 100)}%`;
const quoteNum = (n: number, decimals = 0) => formatCount(amount(n), decimals);
/** 6 → "6", 1.5 → "1.5": minutes as they were typed. */
const quoteMins = (n: number) => quoteNum(n, Number.isInteger(n) ? 0 : 1);

export function quoteTerms(meta: QuoteMeta): string[] {
  return [
    "Prices are in euros. Taxes are not included.",
    `Service charges are fixed until ${longDate(meta.validUntil)}.`,
    "Running costs are estimates at the volumes shown, billed on actual use.",
    "Savings are estimates based on the assumptions shown, for discussion.",
  ];
}

/** One line under the return figures: the return per euro, per case and per minute. */
export function returnFacts(running: RunningCostResult): string[] {
  return [
    running.returnPerEuro > 0 ? `${quoteEur(running.returnPerEuro)} of agent time freed for every €1 it costs to run.` : null,
    running.costPerCase > 0 ? `${formatMoneyExact(running.costPerCase, CURRENCY)} running cost per assistance case.` : null,
    running.agentMinuteCost > 0 && running.lines.some((l) => l.item === "voice")
      ? `A minute on the phone: ${formatRate(running.aiMinuteCost)} with the voice AI, ${formatRate(running.agentMinuteCost)} with an agent.`
      : null,
  ].filter(isSome);
}

/** "a, b and c" */
const listed = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? ""));

/** Under "Services, a month": what the quotation covers. */
export function servicesCaption(running: RunningCostResult): string {
  const has = (item: CostItem) => running.lines.some((l) => l.item === item);
  const parts = [
    has("voice") ? "the voice AI" : null,
    has("phone") ? "its phone line" : null,
    has("notes") || has("inbound") || has("claims") || has("letters") ? "the document AI" : null,
    has("cloud") ? "the cloud it runs on" : null,
  ].filter(isSome);
  return parts.length ? `Pay-as-you-go at your volumes, billed on actual use: ${listed(parts)}` : "No monthly services in this quotation.";
}

export interface ReturnTile {
  value: string;
  label: string;
  note: string;
}

/** The four figures under "What it returns": the hours and the net saving always, then two from the services quoted. */
export function returnTiles(report: BusinessCaseReport): ReturnTile[] {
  const { input, result, running } = report;
  const out = new Set(result.excluded);
  const op = input.operation;
  const a = input.assumptions;
  const own: (ReturnTile | null)[] = [
    out.has("voice") ? null : { value: formatCount(result.afterHoursCalls), label: "After-hours calls answered", note: "a month, instantly" },
    out.has("letters")
      ? null
      : { value: formatDuration(result.letterMinutesAutomated), label: "Letter of Guarantee turnaround", note: `instead of ${formatDuration(result.letterMinutesToday)}` },
    out.has("inbound")
      ? null
      : { value: formatCount(amount(op.monthlyInbound) * share(a.inboundAutomatedPct)), label: "E-mails & faxes handled", note: "a month, without a person" },
    out.has("claims")
      ? null
      : { value: formatCount(amount(op.monthlyClaims)), label: "Claims checked before a handler", note: `a month, ${quotePct(a.claimTimeSavedPct)} of review time saved` },
  ];
  return [
    { value: formatCount(result.hoursFreed), label: "Agent hours freed a month", note: `the work of ${formatCount(result.fte, 1)} full-time staff` },
    { value: quoteEur(running.netAnnualSaving), label: "Net saving a year", note: `after ${quoteEur(running.annualCost)} running cost` },
    ...own.filter(isSome).slice(0, 2),
  ];
}

/** "What this is based on": every number the quotation was worked out from. */
export function quoteBasis(report: BusinessCaseReport): [string, string][] {
  const { input, result, running } = report;
  const op = input.operation;
  const a = input.assumptions;
  const p = input.prices;
  const out = new Set(result.excluded);
  const when = <T,>(item: CostItem, value: T): T | null => (out.has(item) ? null : value);
  const phone = !out.has("phone");
  const documentAi = [
    when("notes", `${formatRate(amount(p.perCallNote))} a call note`),
    when("inbound", `${formatRate(amount(p.perMessage))} an e-mail or fax`),
    when("claims", `${formatRate(amount(p.perClaim))} a claim`),
    when("letters", `${formatRate(amount(p.perLetter))} a letter`),
  ].filter(isSome);
  const rows: ([string, string] | null)[] = [
    ["Assistance cases a month", quoteNum(op.monthlyCases)],
    when("voice", ["Inbound calls a month", `${quoteNum(op.monthlyCalls)} (${quotePct(op.afterHoursCallPct)} outside office hours, ${quoteMins(op.callMinutes)} min each)`]),
    when("inbound", ["E-mails & faxes a month", `${quoteNum(op.monthlyInbound)} (${quoteMins(op.inboundMinutes)} min each)`]),
    when("claims", ["Claims a month", `${quoteNum(op.monthlyClaims)} (${quoteMins(op.claimReviewMinutes)} min review each)`]),
    when("letters", ["Letters of Guarantee a month", `${quoteNum(op.monthlyLetters)} (${formatDuration(result.letterMinutesToday)} each today)`]),
    ["Team", `${quoteEur(amount(op.costPerHour))} loaded cost an hour; ${quoteNum(op.productiveHoursPerMonth)} productive hours per agent a month`],
    when("voice", ["Calls the AI handles end to end", quotePct(a.aiHandledCallPct)]),
    when("voice", ["Time saved on calls a person still takes", quotePct(a.assistedCallTimeSavedPct)]),
    when("claims", ["Claim review time saved", quotePct(a.claimTimeSavedPct)]),
    when("letters", ["Letter of Guarantee preparation time saved", quotePct(a.letterTimeSavedPct)]),
    when("inbound", ["E-mails & faxes handled automatically", quotePct(a.inboundAutomatedPct)]),
    when("voice", [
      phone ? "Voice AI and phone line" : "Voice AI",
      `${formatRate(amount(p.voicePerMinute))}${phone ? ` and ${formatRate(amount(p.phonePerMinute))}` : ""} a minute; ${quoteMins(running.handoverMinutes)} min on a call handed to a person`,
    ]),
    documentAi.length ? ["Document AI", documentAi.join(", ")] : null,
    when("cloud", ["Cloud hosting", `${quoteEur(amount(p.cloudPerMonth))} a month`]),
  ];
  return rows.filter(isSome);
}

/** The payback sentence under the quotation's totals. */
export function paybackLine(report: BusinessCaseReport): string {
  const { quote, running } = report;
  return running.netMonthlySaving > 0
    ? `${formatPayback(quote.paybackMonths)}, from a net saving of ${quoteEur(running.netMonthlySaving)} a month.`
    : `${formatPayback(quote.paybackMonths)}.`;
}
