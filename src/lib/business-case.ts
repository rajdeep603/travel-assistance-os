// ---------------------------------------------------------------------------
// Business case: what the platform would free up in a visitor's operation.
// Pure arithmetic over the visitor's own volumes and a handful of editable
// assumptions — no I/O, so the page recomputes on every keystroke and the
// unit tests pin the formula. Percentages are whole numbers (60 = 60 %);
// money is EUR.
// ---------------------------------------------------------------------------

import { BRAND, POWERED_BY } from "./brand";
import { formatMoney } from "./format";

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

// Modest, round figures for three typical visitors.
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
  assumptions: Assumptions
): BusinessCaseResult {
  const costPerHour = amount(inputs.costPerHour);

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
  ];

  const hoursToday = areas.reduce((sum, a) => sum + a.hoursToday, 0);
  const hoursFreed = areas.reduce((sum, a) => sum + a.hoursFreed, 0);
  const monthlySaving = hoursFreed * costPerHour;
  const productiveHours = amount(inputs.productiveHoursPerMonth);
  const cases = amount(inputs.monthlyCases);
  const letterMinutesToday = amount(inputs.letterHours) * 60;

  return {
    areas,
    hoursToday,
    hoursFreed,
    shareFreed: hoursToday > 0 ? hoursFreed / hoursToday : 0,
    fte: productiveHours > 0 ? hoursFreed / productiveHours : 0,
    monthlySaving,
    annualSaving: monthlySaving * 12,
    savingPerCase: cases > 0 ? monthlySaving / cases : 0,
    afterHoursCalls: amount(inputs.monthlyCalls) * share(inputs.afterHoursCallPct),
    letterMinutesToday,
    letterMinutesAutomated: letterMinutesToday * (1 - share(assumptions.letterTimeSavedPct)),
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
  const hours = formatCount(roughly(result.hoursFreed));
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

  return [
    `${BRAND.name} business case — estimate`,
    "",
    "Your operation (per month)",
    `- Assistance cases: ${n(inputs.monthlyCases)}`,
    `- Inbound calls: ${n(inputs.monthlyCalls)} (${pct(inputs.afterHoursCallPct)} outside office hours, ${n(inputs.callMinutes)} min each)`,
    `- E-mails & faxes: ${n(inputs.monthlyInbound)} (${n(inputs.inboundMinutes)} min each)`,
    `- Claims: ${n(inputs.monthlyClaims)} (${n(inputs.claimReviewMinutes)} min review each)`,
    `- Letters of Guarantee: ${n(inputs.monthlyLetters)} (${formatDuration(result.letterMinutesToday)} each today)`,
    `- Loaded cost per agent hour: ${eur(amount(inputs.costPerHour))}; ${n(inputs.productiveHoursPerMonth)} productive hours per agent a month`,
    "",
    "Assumptions",
    `- Calls the AI handles end-to-end: ${pct(assumptions.aiHandledCallPct)}`,
    `- Time saved on calls a person still takes: ${pct(assumptions.assistedCallTimeSavedPct)}`,
    `- Claim review time saved: ${pct(assumptions.claimTimeSavedPct)}`,
    `- Letter of Guarantee preparation time saved: ${pct(assumptions.letterTimeSavedPct)}`,
    `- E-mails & faxes handled automatically: ${pct(assumptions.inboundAutomatedPct)}`,
    "",
    "Results",
    `- Agent hours freed: ${formatCount(result.hoursFreed)} a month (about ${formatCount(result.fte, 1)} full-time staff)`,
    `- Cost saved: ${eur(result.monthlySaving)} a month, ${eur(result.annualSaving)} a year`,
    `- After-hours calls answered instantly: ${formatCount(result.afterHoursCalls)} a month`,
    `- Letter of Guarantee turnaround: ${formatDuration(result.letterMinutesToday)} today, ${formatDuration(result.letterMinutesAutomated)} with ${BRAND.name}`,
    `- By area: ${byArea}`,
    "",
    `${DISCLAIMER}. ${BRAND.name} · ${POWERED_BY}`,
  ].join("\n");
}
