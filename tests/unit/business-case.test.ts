import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_INPUTS,
  DEFAULT_COST_CONTAINMENT,
  DEFAULT_RUNNING_COST_PRICES,
  EMPTY_QUOTE,
  PRESETS,
  buildSummary,
  businessCaseReport,
  calculateBusinessCase,
  calculateCostContainment,
  calculateQuote,
  calculateRunningCost,
  formatDuration,
  formatPayback,
  formatRate,
  headline,
  netHeadline,
  quoteNumber,
  roughly,
  withCostContainment,
  withQuote,
  withRunningCost,
  type BusinessCaseInput,
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

describe("AI running cost", () => {
  const result = calculateBusinessCase(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS);
  const running = calculateRunningCost(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS, DEFAULT_RUNNING_COST_PRICES, result);

  it("starts from the list prices, in euros at the demo rate, and a lean cloud", () => {
    // $0.08 a minute voice; $0.0085 + $0.0044 phone; $4 / $20 per million tokens.
    expect(DEFAULT_RUNNING_COST_PRICES).toEqual({
      voicePerMinute: 0.074,
      phonePerMinute: 0.012,
      handoverMinutes: 1.5,
      perCallNote: 0.022,
      perMessage: 0.092,
      perClaim: 0.125,
      perLetter: 0.059,
      cloudPerMonth: 120,
    });
  });

  it("works the defaults through by hand", () => {
    const byItem = Object.fromEntries(running.lines.map((l) => [l.item, l]));
    // 3,600 calls closed × 6 min + 2,400 handed over × 1.5 min.
    expect(running.callsClosed).toBeCloseTo(3_600);
    expect(running.callsHandedOver).toBeCloseTo(2_400);
    expect(running.voiceMinutes).toBeCloseTo(25_200);
    expect(byItem.voice.cost).toBeCloseTo(1_864.8);
    expect(byItem.phone.cost).toBeCloseTo(302.4);
    expect(byItem.notes.cost).toBeCloseTo(132);
    expect(byItem.inbound.cost).toBeCloseTo(368);
    expect(byItem.claims.cost).toBeCloseTo(250);
    expect(byItem.letters.cost).toBeCloseTo(17.7);
    expect(byItem.cloud).toMatchObject({ volume: 1, unit: "month", cost: 120 });

    expect(running.monthlyCost).toBeCloseTo(3_054.9);
    expect(running.annualCost).toBeCloseTo(36_658.8);
    expect(running.costPerCase).toBeCloseTo(3_054.9 / 1_500);
    expect(running.netMonthlySaving).toBeCloseTo(38_260 - 3_054.9);
    expect(running.netAnnualSaving).toBeCloseTo((38_260 - 3_054.9) * 12);
    expect(running.returnPerEuro).toBeCloseTo(38_260 / 3_054.9);
    expect(running.aiMinuteCost).toBeCloseTo(0.086);
    expect(running.agentMinuteCost).toBeCloseTo(0.5);
  });

  it("never keeps the voice AI on a hand-over longer than the call", () => {
    const r = calculateRunningCost({ ...DEFAULT_INPUTS, callMinutes: 1 }, DEFAULT_ASSUMPTIONS, { ...DEFAULT_RUNNING_COST_PRICES, handoverMinutes: 5 });
    expect(r.handoverMinutes).toBe(1);
    expect(r.voiceMinutes).toBeCloseTo(6_000);
  });

  it("charges only the cloud for an empty operation", () => {
    const r = calculateRunningCost(ZERO_INPUTS, DEFAULT_ASSUMPTIONS, DEFAULT_RUNNING_COST_PRICES);
    expect(r.lines.filter((l) => l.cost > 0).map((l) => l.item)).toEqual(["cloud"]);
    expect(r.monthlyCost).toBe(120);
    expect(r.netMonthlySaving).toBe(-120);
    expect(r.returnPerEuro).toBe(0);
    const free = calculateRunningCost(ZERO_INPUTS, DEFAULT_ASSUMPTIONS, { ...DEFAULT_RUNNING_COST_PRICES, cloudPerMonth: 0 });
    expect(free.monthlyCost).toBe(0);
  });

  it("treats blank and negative prices as zero", () => {
    const r = calculateRunningCost(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS, {
      ...DEFAULT_RUNNING_COST_PRICES,
      voicePerMinute: Number.NaN,
      perClaim: -1,
    });
    expect(r.lines.find((l) => l.item === "voice")!.cost).toBe(0);
    expect(r.lines.find((l) => l.item === "claims")!.cost).toBe(0);
    expect(Number.isFinite(r.monthlyCost)).toBe(true);
  });

  it("puts the net figure in the headline, or says when the AI isn't covered", () => {
    expect(netHeadline(result, running)).toBe(
      "With these numbers, CareTrail would free about 1,275 agent hours a month — roughly 9.1 full-time staff, worth about €459,000 a year, or €422,000 after the AI's running costs."
    );
    const unpaid = calculateBusinessCase({ ...DEFAULT_INPUTS, costPerHour: 0 }, DEFAULT_ASSUMPTIONS);
    const costly = calculateRunningCost({ ...DEFAULT_INPUTS, costPerHour: 0 }, DEFAULT_ASSUMPTIONS, DEFAULT_RUNNING_COST_PRICES, unpaid);
    expect(costly.netAnnualSaving).toBeLessThan(0);
    expect(netHeadline(unpaid, costly)).toMatch(/which doesn't cover the €36,700 a year the AI costs to run\.$/);
    const empty = calculateBusinessCase(ZERO_INPUTS, DEFAULT_ASSUMPTIONS);
    expect(netHeadline(empty, calculateRunningCost(ZERO_INPUTS, DEFAULT_ASSUMPTIONS, DEFAULT_RUNNING_COST_PRICES, empty))).toBe(headline(empty));
  });

  it("adds its own section to the summary, without naming a vendor", () => {
    const labour = buildSummary(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS, result);
    const text = withRunningCost(labour, running);
    expect(text).toContain("- Voice AI on calls: 25,200 min × €0.074 = €1,865");
    expect(text).toContain("- Letters of Guarantee drafted: 300 × €0.059 = €18");
    expect(text).toContain("- Cloud hosting (servers, database, storage and backups): €120");
    expect(text).toContain("- Total: €3,055 a month, €36,659 a year (€2.04 per case)");
    expect(text).toContain("- Net saving after AI costs: €35,205 a month, €422,461 a year (€13 of agent time freed for every €1 of AI)");
    expect(text.split("\n").at(-1)).toBe(labour.split("\n").at(-1));
    expect(text).not.toMatch(/NaN|undefined|Claude|Grok|Twilio|xAI|Anthropic/);
  });

  it("formats prices to the tenth of a cent", () => {
    expect(formatRate(0.074)).toBe("€0.074");
    expect(formatRate(0.5)).toBe("€0.50");
    expect(formatRate(0.125)).toBe("€0.125");
  });
});

describe("quotation", () => {
  const input: BusinessCaseInput = {
    operation: DEFAULT_INPUTS,
    assumptions: DEFAULT_ASSUMPTIONS,
    prices: DEFAULT_RUNNING_COST_PRICES,
    costContainment: DEFAULT_COST_CONTAINMENT,
    quote: {
      preparedFor: "  Example Assistance Ltd ",
      services: [
        { description: "Setup and configuration", amount: 6_000 },
        { description: "Team training", amount: 0 },
        { description: "   ", amount: 900 },
        { description: "Claims system integration", amount: Number.NaN },
      ],
    },
  };
  const report = businessCaseReport(input);

  it("totals the one-time services, keeps included ones, and drops blank rows", () => {
    expect(report.quote.preparedFor).toBe("Example Assistance Ltd");
    expect(report.quote.services).toEqual([
      { description: "Setup and configuration", amount: 6_000 },
      { description: "Team training", amount: 0 },
      { description: "Claims system integration", amount: 0 },
    ]);
    expect(report.quote.oneTimeTotal).toBe(6_000);
    expect(report.quote.monthlyRunningCost).toBeCloseTo(3_054.9);
    expect(report.quote.firstYearCost).toBeCloseTo(6_000 + 36_658.8);
    expect(report.quote.paybackMonths).toBeCloseTo(6_000 / (38_260 - 3_054.9));
  });

  it("says how soon the net saving pays the one-time cost back", () => {
    expect(formatPayback(0)).toBe("No one-time cost to pay back");
    expect(formatPayback(0.17)).toBe("Pays back within the first month");
    expect(formatPayback(2.44)).toBe("Pays back in 2.4 months");
    expect(formatPayback(14.6)).toBe("Pays back in 15 months");
    expect(formatPayback(null)).toBe("The net saving doesn't pay back the one-time cost");
    const losing = calculateRunningCost({ ...DEFAULT_INPUTS, costPerHour: 0 }, DEFAULT_ASSUMPTIONS, DEFAULT_RUNNING_COST_PRICES);
    expect(calculateQuote({ preparedFor: "", services: [{ description: "Setup", amount: 5_000 }] }, losing).paybackMonths).toBeNull();
    expect(calculateQuote(EMPTY_QUOTE, losing).paybackMonths).toBe(0);
  });

  it("numbers the quotation by date and content", () => {
    expect(quoteNumber(input, "2026-10-17")).toMatch(/^Q-20261017-[0-9A-F]{4}$/);
    expect(quoteNumber(input, "2026-10-17")).toBe(quoteNumber({ ...input }, "2026-10-17"));
    expect(quoteNumber(input, "2026-10-17")).not.toBe(quoteNumber({ ...input, quote: EMPTY_QUOTE }, "2026-10-17"));
  });

  it("puts who it's for and the services in the summary, closing line still last", () => {
    const labour = buildSummary(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS, report.result);
    expect(report.summary.split("\n")[1]).toBe("Prepared for Example Assistance Ltd");
    expect(report.summary).toContain("- Setup and configuration: €6,000");
    expect(report.summary).toContain("- Team training: included");
    expect(report.summary).toContain("- Total one-time: €6,000");
    expect(report.summary).toContain("- First year with running costs: €42,659. Pays back within the first month.");
    expect(report.summary.split("\n").at(-1)).toBe(labour.split("\n").at(-1));
    // Without services or a name, the summary is the business case alone.
    const plain = businessCaseReport({ ...input, quote: EMPTY_QUOTE });
    const expected = withCostContainment(
      withRunningCost(labour, plain.running),
      DEFAULT_COST_CONTAINMENT,
      calculateCostContainment(DEFAULT_COST_CONTAINMENT)
    );
    expect(plain.summary).toBe(expected);
    expect(withQuote(expected, plain.quote)).toBe(expected);
    expect(plain.headline).toBe(netHeadline(plain.result, plain.running));
  });
});
