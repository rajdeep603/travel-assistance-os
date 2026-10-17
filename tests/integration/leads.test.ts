import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ASSUMPTIONS, DEFAULT_COST_CONTAINMENT, DEFAULT_INPUTS, DEFAULT_RUNNING_COST_PRICES, EMPTY_QUOTE } from "@/lib/business-case";
import { createLead, deleteLead, getLead, leadPdf, listLeads, setLeadStatus } from "@/lib/services/leads";
import { extractTextFromFile } from "@/lib/services/pdf";
import { zonedToday } from "@/lib/time";

// A quotation submitted from the business case becomes a lead: saved once,
// listed, moved along, its PDF downloadable again, and deletable for good.

const prisma = new PrismaClient();
const testStart = new Date();

const input = {
  operation: DEFAULT_INPUTS,
  assumptions: DEFAULT_ASSUMPTIONS,
  prices: DEFAULT_RUNNING_COST_PRICES,
  costContainment: DEFAULT_COST_CONTAINMENT,
  quote: {
    customerName: "Aylin Kaya",
    companyName: "Leads Test Assistance",
    email: "aylin@leads-test.com",
    phone: "+90 532 000 00 00",
    services: [{ description: "Setup and configuration", amount: 6_000 }],
  },
};

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.$disconnect();
});

describe("leads", () => {
  it("needs the customer's name and company", async () => {
    await expect(createLead({ input: { ...input, quote: EMPTY_QUOTE }, operator: null })).rejects.toMatchObject({ status: 400 });
  });

  it("saves a submitted quotation once, with its figures, and lists it", async () => {
    const { lead, existing } = await createLead({ input, operator: "presenter" });
    expect(existing).toBe(false);
    expect(lead.ref).toMatch(/^LEAD-\d{4,}$/);
    expect(lead.quoteNumber).toMatch(new RegExp(`^Q-${zonedToday().replace(/-/g, "")}-[0-9A-F]{6}$`));
    expect(lead).toMatchObject({ customerName: "Aylin Kaya", companyName: "Leads Test Assistance", email: "aylin@leads-test.com", status: "NEW", createdBy: "presenter" });
    expect(Number(lead.oneTimeTotal)).toBe(6_000);
    expect(Number(lead.monthlyCost)).toBeCloseTo(3_054.9);
    expect(Number(lead.firstYearCost)).toBeCloseTo(6_000 + 36_658.8);
    expect(Number(lead.netAnnualSaving)).toBeCloseTo((38_260 - 3_054.9) * 12);

    // A double click returns the same lead rather than a second one.
    const again = await createLead({ input, operator: "presenter" });
    expect(again).toMatchObject({ existing: true, lead: { id: lead.id } });

    const listed = (await listLeads()).find((l) => l.id === lead.id);
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty("input");
  });

  it("shows, moves along, prints and deletes a lead", async () => {
    const { lead } = await createLead({ input: { ...input, quote: { ...input.quote, companyName: "Leads Test Second" } }, operator: null });
    const detail = await getLead(lead.id);
    expect(detail.input.quote.companyName).toBe("Leads Test Second");
    expect(detail.quoteDate).toBe(zonedToday());

    expect((await setLeadStatus(lead.id, "CONTACTED")).status).toBe("CONTACTED");

    const { pdf, filename } = await leadPdf(lead.id);
    expect(filename).toBe(`sthiram-caretrail-quotation-${lead.quoteNumber}.pdf`);
    const text = (await extractTextFromFile(pdf, "application/pdf")).replace(/\s+/g, " ");
    expect(text).toContain(`No. ${lead.quoteNumber}`);
    expect(text).toContain("Prepared for Leads Test Second Aylin Kaya");

    await deleteLead(lead.id);
    await expect(getLead(lead.id)).rejects.toMatchObject({ status: 404 });
    await expect(deleteLead(lead.id)).rejects.toMatchObject({ status: 404 });
  });
});
