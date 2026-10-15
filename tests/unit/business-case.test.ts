import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_INPUTS,
  PRESETS,
  buildSummary,
  calculateBusinessCase,
  formatDuration,
  headline,
  roughly,
  type Assumptions,
  type BusinessCaseResult,
  type OperationInputs,
} from "@/lib/business-case";

const ZERO_INPUTS: OperationInputs = {
  monthlyCases: 0,
  monthlyCalls: 0,
  afterHoursCallPct: 0,
  callMinutes: 0,
  monthlyClaims: 0,
  claimReviewMinutes: 0,
  monthlyLetters: 0,
  letterHours: 0,
  monthlyInbound: 0,
  inboundMinutes: 0,
  costPerHour: 0,
  productiveHoursPerMonth: 0,
};

const FULL_AUTOMATION: Assumptions = {
  aiHandledCallPct: 100,
  assistedCallTimeSavedPct: 100,
  claimTimeSavedPct: 100,
  letterTimeSavedPct: 100,
  inboundAutomatedPct: 100,
};

/** Every number in a result, including the per-area rows. */
function numbersIn(result: BusinessCaseResult): number[] {
  const { areas, ...totals } = result;
  return [
    ...Object.values(totals),
    ...areas.flatMap((a) => [a.volume, a.hoursToday, a.hoursFreed, a.saving]),
  ];
}

function expectSane(result: BusinessCaseResult) {
  for (const value of numbersIn(result)) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
  expect(result.hoursFreed).toBeLessThanOrEqual(result.hoursToday + 1e-9);
}

describe("calculateBusinessCase", () => {
  it("works the defaults through by hand", () => {
    const r = calculateBusinessCase(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS);
    const byArea = Object.fromEntries(r.areas.map((a) => [a.area, a]));

    // 6,000 calls × 6 min = 600 h; 60 % AI + 40 % × 30 % assisted = 72 % freed.
    expect(byArea.calls.hoursToday).toBeCloseTo(600);
    expect(byArea.calls.hoursFreed).toBeCloseTo(432);
    // 4,000 messages × 5 min = 333.3 h; 70 % automated.
    expect(byArea.inbound.hoursFreed).toBeCloseTo(233.33, 1);
    // 2,000 claims × 15 min = 500 h; 50 % saved.
    expect(byArea.claims.hoursFreed).toBeCloseTo(250);
    // 300 letters × 1.5 h = 450 h; 80 % saved.
    expect(byArea.letters.hoursFreed).toBeCloseTo(360);

    expect(r.hoursFreed).toBeCloseTo(1275.33, 1);
    expect(r.fte).toBeCloseTo(1275.33 / 140, 3);
    expect(r.monthlySaving).toBeCloseTo(38_260);
    expect(r.annualSaving).toBeCloseTo(459_120);
    expect(r.savingPerCase).toBeCloseTo(38_260 / 1_500);
    expect(r.afterHoursCalls).toBeCloseTo(2_100);
    expect(r.letterMinutesToday).toBe(90);
    expect(r.letterMinutesAutomated).toBeCloseTo(18);
    expect(byArea.letters.saving).toBeCloseTo(360 * 30);
  });

  it("returns zeros, not NaN, for an empty operation", () => {
    const r = calculateBusinessCase(ZERO_INPUTS, DEFAULT_ASSUMPTIONS);
    expectSane(r);
    for (const value of numbersIn(r)) expect(value).toBe(0);
  });

  it("frees nothing when every assumption is zero", () => {
    const none: Assumptions = {
      aiHandledCallPct: 0,
      assistedCallTimeSavedPct: 0,
      claimTimeSavedPct: 0,
      letterTimeSavedPct: 0,
      inboundAutomatedPct: 0,
    };
    const r = calculateBusinessCase(DEFAULT_INPUTS, none);
    expectSane(r);
    expect(r.hoursToday).toBeGreaterThan(0);
    expect(r.hoursFreed).toBe(0);
    expect(r.annualSaving).toBe(0);
    expect(r.letterMinutesAutomated).toBe(r.letterMinutesToday);
    // The AI still picks up every after-hours call.
    expect(r.afterHoursCalls).toBeCloseTo(2_100);
  });

  it("frees the whole workload at 100 % automation", () => {
    const r = calculateBusinessCase(DEFAULT_INPUTS, FULL_AUTOMATION);
    expectSane(r);
    expect(r.hoursFreed).toBeCloseTo(r.hoursToday);
    expect(r.shareFreed).toBeCloseTo(1);
    expect(r.letterMinutesAutomated).toBe(0);
    for (const a of r.areas) expect(a.hoursFreed).toBeCloseTo(a.hoursToday);
  });

  it("guards the divisions: no productive hours or no cases", () => {
    const r = calculateBusinessCase(
      { ...DEFAULT_INPUTS, productiveHoursPerMonth: 0, monthlyCases: 0 },
      DEFAULT_ASSUMPTIONS
    );
    expectSane(r);
    expect(r.fte).toBe(0);
    expect(r.savingPerCase).toBe(0);
    expect(r.hoursFreed).toBeGreaterThan(0);
  });

  it("treats blanks, negatives and out-of-range percentages safely", () => {
    const messy: OperationInputs = {
      ...DEFAULT_INPUTS,
      monthlyCalls: Number.NaN,
      callMinutes: -5,
      monthlyClaims: Number.POSITIVE_INFINITY,
      afterHoursCallPct: 250,
      costPerHour: -30,
    };
    const r = calculateBusinessCase(messy, {
      ...DEFAULT_ASSUMPTIONS,
      aiHandledCallPct: 150,
      claimTimeSavedPct: -20,
      letterTimeSavedPct: Number.NaN,
    });
    expectSane(r);
    expect(r.afterHoursCalls).toBe(0);
    expect(r.monthlySaving).toBe(0);
    expect(r.letterMinutesAutomated).toBe(r.letterMinutesToday);

    const capped = calculateBusinessCase(
      { ...DEFAULT_INPUTS, afterHoursCallPct: 250 },
      { ...DEFAULT_ASSUMPTIONS, aiHandledCallPct: 150 }
    );
    expect(capped.afterHoursCalls).toBe(DEFAULT_INPUTS.monthlyCalls);
    expect(capped.areas[0].hoursFreed).toBeCloseTo(capped.areas[0].hoursToday);
  });

  it("moves the right way when an assumption changes", () => {
    const base = calculateBusinessCase(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS);
    const more = calculateBusinessCase(DEFAULT_INPUTS, {
      ...DEFAULT_ASSUMPTIONS,
      aiHandledCallPct: 80,
    });
    expect(more.areas[0].hoursFreed).toBeGreaterThan(base.areas[0].hoursFreed);
    expect(more.annualSaving).toBeGreaterThan(base.annualSaving);
    expect(more.areas.slice(1)).toEqual(base.areas.slice(1));
  });
});

describe("presets", () => {
  it("are distinct, and the default is the regional company", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(PRESETS.length).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_INPUTS).toEqual(PRESETS.find((p) => p.id === "regional")!.inputs);
  });

  it.each(PRESETS.map((p) => [p.label, p] as const))("%s gives sensible numbers", (_label, preset) => {
    const r = calculateBusinessCase(preset.inputs, DEFAULT_ASSUMPTIONS);
    expectSane(r);
    expect(r.hoursFreed).toBeGreaterThan(0);
    expect(r.shareFreed).toBeGreaterThan(0.3);
    expect(r.shareFreed).toBeLessThan(0.9);
    expect(r.fte).toBeGreaterThan(0.5);
    expect(r.fte).toBeLessThan(100);
    expect(r.annualSaving).toBeGreaterThan(10_000);
    expect(r.annualSaving).toBeLessThan(10_000_000);
    expect(r.letterMinutesAutomated).toBeLessThan(60);
  });

  it("grow with the size of the operation", () => {
    const savings = PRESETS.map((p) => calculateBusinessCase(p.inputs, DEFAULT_ASSUMPTIONS).annualSaving);
    expect([...savings].sort((a, b) => a - b)).toEqual(savings);
  });
});

describe("wording", () => {
  it("rounds 'about' figures to three significant digits", () => {
    expect(roughly(0)).toBe(0);
    expect(roughly(847.6)).toBe(848);
    expect(roughly(1_275.33)).toBe(1_280);
    expect(roughly(459_120)).toBe(459_000);
    expect(roughly(2_808_000)).toBe(2_810_000);
  });

  it("formats durations as minutes or hours", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(0.4)).toBe("under a minute");
    expect(formatDuration(18)).toBe("18 min");
    expect(formatDuration(90)).toBe("1.5 h");
    expect(formatDuration(120)).toBe("2 h");
  });

  it("states the headline in round figures", () => {
    const r = calculateBusinessCase(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS);
    expect(headline(r)).toBe(
      "With these numbers, CareTrail would free about 1,275 agent hours a month — roughly 9.1 full-time staff, worth about €459,000 a year."
    );
  });

  it("asks for volumes instead of promising zero", () => {
    const r = calculateBusinessCase(ZERO_INPUTS, DEFAULT_ASSUMPTIONS);
    expect(headline(r)).toMatch(/^Enter your monthly volumes/);
  });

  it("summarises inputs, assumptions and results for the follow-up e-mail", () => {
    const r = calculateBusinessCase(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS);
    const text = buildSummary(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS, r);
    expect(text).toContain("Inbound calls: 6,000 (35% outside office hours, 6 min each)");
    expect(text).toContain("Calls the AI handles end-to-end: 60%");
    expect(text).toContain("Agent hours freed: 1,275 a month (about 9.1 full-time staff)");
    expect(text).toContain("€38,260 a month, €459,120 a year");
    expect(text).toContain("Letter of Guarantee turnaround: 1.5 h today, 18 min with CareTrail");
    expect(text.trimEnd().split("\n").at(-1)).toBe(
      "Estimates for discussion, based on the assumptions shown. CareTrail · Powered by Sthiram"
    );
    expect(text).not.toMatch(/NaN|undefined|Claude|Grok|Twilio/);
  });
});
