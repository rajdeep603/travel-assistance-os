import { describe, expect, it } from "vitest";
import { DEFAULT_ASSUMPTIONS, DEFAULT_COST_CONTAINMENT, DEFAULT_INPUTS, DEFAULT_RUNNING_COST_PRICES, EMPTY_QUOTE } from "@/lib/business-case";
import { BusinessCaseInputSchema, businessCasePdf } from "@/lib/services/business-case-report";
import { extractTextFromFile } from "@/lib/services/pdf";

const base = {
  operation: DEFAULT_INPUTS,
  assumptions: DEFAULT_ASSUMPTIONS,
  prices: DEFAULT_RUNNING_COST_PRICES,
  costContainment: DEFAULT_COST_CONTAINMENT,
};

describe("the quotation PDF", () => {
  it("is a two-page quotation from Sthiram with the services, running cost and return", async () => {
    const { pdf, filename, number } = await businessCasePdf({
      ...base,
      quote: {
        customerName: "Aylin Kaya",
        companyName: "Example Assistance Ltd",
        email: "aylin@assistance-company.com",
        phone: "+90 532 000 00 00",
        services: [{ description: "Setup and configuration", amount: 6_000 }, { description: "Team training", amount: 0 }],
      },
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(filename).toBe(`sthiram-caretrail-quotation-${number}.pdf`);
    const text = (await extractTextFromFile(pdf, "application/pdf")).replace(/\s+/g, " ");
    for (const expected of [
      "Quotation",
      `No. ${number}`,
      "Valid until",
      "Prepared for Example Assistance Ltd Aylin Kaya · aylin@assistance-company.com · +90 532 000 00 00",
      "From Sthiram Services LLP CareTrail · AI assistance for travel health",
      "Services, a month",
      "Service charges",
      "Setup and configuration €6,000",
      "Team training Included",
      "Total one-time €6,000",
      "Cloud hosting Servers, database, storage and backups €120",
      "Total a month €36,659 a year €3,055",
      "Pays back within the first month, from a net saving of €35,205 a month.",
      "or €422,000 after the AI's running costs",
      "Taxes are not included.",
      "Page 2 of 2",
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain("Page 3");
    expect(text).not.toMatch(/NaN|undefined|Claude|Grok|Twilio/);
  });

  it("says so when no one-time services are quoted", async () => {
    const { pdf } = await businessCasePdf({ ...base, quote: EMPTY_QUOTE });
    const text = (await extractTextFromFile(pdf, "application/pdf")).replace(/\s+/g, " ");
    expect(text).toContain("No one-time service charges in this quotation.");
    expect(text).toContain("Prepared for Your organisation");
  });

  it("leaves a service out of every section when the quotation does", async () => {
    const { pdf } = await businessCasePdf({ ...base, quote: { ...EMPTY_QUOTE, excluded: ["voice"] } });
    const text = (await extractTextFromFile(pdf, "application/pdf")).replace(/\s+/g, " ");
    expect(text).not.toMatch(/Voice AI|Phone line|Call notes|After-hours calls|Inbound calls a month/);
    expect(text).toContain("the document AI and the cloud it runs on");
    expect(text).toContain("Total a month €9,068 a year €756");
    expect(text).toContain("E-mails & faxes handled");
    expect(text).toContain("Page 2 of 2");
  });

  it("accepts the page's numbers, blanks included, and fills in a missing quotation", () => {
    const parsed = BusinessCaseInputSchema.parse(JSON.parse(JSON.stringify({ ...base, operation: { ...DEFAULT_INPUTS, monthlyCalls: Number.NaN } })));
    expect(parsed.operation.monthlyCalls).toBe(0);
    expect(parsed.quote).toEqual(EMPTY_QUOTE);
    expect(() => BusinessCaseInputSchema.parse({ ...base, quote: { preparedFor: "", services: Array(21).fill({ description: "x", amount: 1 }) } })).toThrow();
    expect(BusinessCaseInputSchema.parse({ ...base, quote: { ...EMPTY_QUOTE, excluded: ["voice", "cloud"] } }).quote.excluded).toEqual(["voice", "cloud"]);
    expect(() => BusinessCaseInputSchema.parse({ ...base, quote: { ...EMPTY_QUOTE, excluded: ["fax"] } })).toThrow();
  });
});
