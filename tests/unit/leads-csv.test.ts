import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { csvCell, leadsCsv, type LeadSummary } from "@/lib/services/leads";

const money = (n: number) => new Prisma.Decimal(n);

const base: LeadSummary = {
  id: "lead1",
  ref: "LEAD-1001",
  quoteNumber: "Q-20261022-ABCDEF",
  customerName: "Maria Lopez",
  companyName: 'Assist "Group", Ltd',
  email: "maria@assist.example",
  phone: "+34 600 000 000",
  oneTimeTotal: money(6000),
  monthlyCost: money(3054.9),
  firstYearCost: money(42658.8),
  netAnnualSaving: money(422461.2),
  status: "CONTACTED",
  source: "QUOTATION",
  role: null,
  message: null,
  segment: "insurer",
  pains: ["overbilling", "languages"],
  pilot: null,
  notes: "Line one\nLine two",
  nextStep: "Call with their COO",
  nextStepOn: new Date("2026-11-03T00:00:00Z"),
  followUpSentAt: new Date("2026-10-22T18:00:00Z"),
  contactConsentAt: new Date("2026-10-22T10:05:00Z"),
  contactConsentBy: "presenter",
  createdBy: "presenter",
  createdAt: new Date("2026-10-22T10:00:00Z"),
  updatedAt: new Date("2026-10-22T18:00:00Z"),
};

describe("the leads CSV export", () => {
  it("quotes what needs quoting and leaves the rest alone", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", now')).toBe('"say ""hi"", now"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("writes one row per lead with the labels a CRM wants, after a header", () => {
    const visitor: LeadSummary = { ...base, id: "lead2", ref: "LEAD-1002", quoteNumber: "", source: "VISITOR", role: "COO", firstYearCost: money(0), netAnnualSaving: money(0), notes: null, nextStep: null, nextStepOn: null, followUpSentAt: null, contactConsentAt: null };
    const csv = leadsCsv([base, visitor]);
    expect(csv.startsWith("﻿Reference,Created,Source,Company,Contact,Role,E-mail,Phone,Status,Organisation,Would solve first,Pilot,Quotation,First year (EUR),Net saving a year (EUR),Next step,Next step by,Follow-up sent,Agreed to e-mail,Notes\r\n")).toBe(true);
    const rows = csv.replace("﻿", "").split("\r\n").filter(Boolean);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe(
      'LEAD-1001,2026-10-22T10:00:00.000Z,Quotation,"Assist ""Group"", Ltd",Maria Lopez,,maria@assist.example,+34 600 000 000,CONTACTED,Large group or insurer,Overbilling and bill review; Languages the team doesn\'t speak,,Q-20261022-ABCDEF,42658.8,422461.2,Call with their COO,2026-11-03,2026-10-22T18:00:00.000Z,2026-10-22T10:05:00.000Z,"Line one\nLine two"'.replace("\\n", "\n")
    );
    expect(rows[2]).toBe('LEAD-1002,2026-10-22T10:00:00.000Z,QR page,"Assist ""Group"", Ltd",Maria Lopez,COO,maria@assist.example,+34 600 000 000,CONTACTED,Large group or insurer,Overbilling and bill review; Languages the team doesn\'t speak,,,,,,,,,');
  });
});
