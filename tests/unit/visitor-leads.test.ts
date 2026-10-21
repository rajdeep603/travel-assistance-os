import { describe, expect, it } from "vitest";
import { VisitorLeadSchema, hasQuotation } from "@/lib/services/leads";

// The booth's QR page: what a visitor may send, and what is thrown away.

const good = { name: "Maria Lopez", company: "Assist Group", email: "maria@assist-group.example", consent: true as const };

describe("visitor leads from the QR page", () => {
  it("takes a name, company, e-mail and consent, filling the rest in", () => {
    const v = VisitorLeadSchema.parse(good);
    expect(v).toMatchObject({ phone: "", role: "", segment: null, pains: [], message: "", website: "" });
  });

  it("keeps the organisation and the pains it knows, and rejects others", () => {
    expect(VisitorLeadSchema.parse({ ...good, segment: "insurer", pains: ["overbilling", "languages"] })).toMatchObject({ segment: "insurer", pains: ["overbilling", "languages"] });
    expect(() => VisitorLeadSchema.parse({ ...good, segment: "cruise-line" })).toThrow();
    expect(() => VisitorLeadSchema.parse({ ...good, pains: ["parking"] })).toThrow();
  });

  it("needs consent, a real e-mail address and an empty honeypot", () => {
    expect(() => VisitorLeadSchema.parse({ ...good, consent: false })).toThrow(/agree/);
    expect(() => VisitorLeadSchema.parse({ ...good, email: "not-an-address" })).toThrow(/e-mail/);
    expect(() => VisitorLeadSchema.parse({ ...good, website: "http://spam.example" })).toThrow();
    expect(() => VisitorLeadSchema.parse({ ...good, name: "M" })).toThrow(/name/);
  });

  it("knows which leads carry a quotation", () => {
    expect(hasQuotation({ quoteNumber: "" })).toBe(false);
    expect(hasQuotation({ quoteNumber: "Q-20261022-ABCDEF" })).toBe(true);
  });
});
