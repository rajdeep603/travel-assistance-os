import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ASSUMPTIONS, DEFAULT_COST_CONTAINMENT, DEFAULT_INPUTS, DEFAULT_RUNNING_COST_PRICES, EMPTY_QUOTE } from "@/lib/business-case";
import { createLead, createVisitorLead, deleteLead, followUpDraft, getLead, leadPdf, listLeads, setLeadStatus } from "@/lib/services/leads";
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

describe("visitor leads from the booth's QR page", () => {
  const visitor = {
    name: "Nadia Petrova",
    company: "Visitor Test Assistance",
    email: "nadia@visitor-test.example",
    phone: "",
    role: "COO",
    segment: "assistance" as const,
    pains: ["after-hours" as const, "overbilling" as const],
    message: "We run 40,000 calls a year.",
    consent: true as const,
    website: "",
  };

  it("saves a visitor without a quotation, and a second scan updates the same lead", async () => {
    const { lead, existing } = await createVisitorLead(visitor);
    expect(existing).toBe(false);
    expect(lead).toMatchObject({ source: "VISITOR", quoteNumber: "", status: "NEW", createdBy: "visitor", role: "COO", segment: "assistance", pains: ["after-hours", "overbilling"] });
    expect(lead.ref).toMatch(/^LEAD-\d{4,}$/);
    expect(Number(lead.firstYearCost)).toBe(0);

    // A second scan adds what's new and keeps what was there (the role, the pains picked before).
    const again = await createVisitorLead({ ...visitor, email: visitor.email.toUpperCase(), role: "", pains: ["languages"] });
    expect(again).toMatchObject({ existing: true, lead: { id: lead.id, role: "COO", email: visitor.email, pains: ["after-hours", "overbilling", "languages"] } });

    // No quotation yet: nothing to print, and the follow-up is a recap alone.
    await expect(leadPdf(lead.id)).rejects.toMatchObject({ status: 400 });
    const draft = await followUpDraft(lead.id);
    expect(draft.text).toContain("Thank you for stopping by");
    expect(draft.text).not.toContain("attached");
    expect(draft.subject).not.toContain("quotation");
  });

  it("files the quotation generated afterwards onto the visitor's lead", async () => {
    const { lead } = await createVisitorLead({ ...visitor, email: "second@visitor-test.example" });
    const quotedInput = { ...input, quote: { ...input.quote, customerName: visitor.name, companyName: visitor.company, email: "second@visitor-test.example" } };
    const { lead: quoted, existing } = await createLead({ input: quotedInput, operator: "presenter", leadId: lead.id });
    expect(existing).toBe(false);
    expect(quoted.id).toBe(lead.id);
    expect(quoted.ref).toBe(lead.ref);
    expect(quoted.source).toBe("VISITOR");
    expect(quoted.quoteNumber).toMatch(/^Q-/);
    expect(Number(quoted.oneTimeTotal)).toBe(6_000);
    expect((await followUpDraft(lead.id)).text).toContain(`quotation ${quoted.quoteNumber} attached`);
    expect((await leadPdf(lead.id)).filename).toMatch(/\.pdf$/);

    const unseen = { ...input, quote: { ...input.quote, companyName: "Visitor Test Nobody" } };
    await expect(createLead({ input: unseen, operator: null, leadId: "no-such-lead" })).rejects.toMatchObject({ status: 404 });
  });
});
