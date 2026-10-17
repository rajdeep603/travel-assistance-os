import { afterAll, afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ASSUMPTIONS, DEFAULT_COST_CONTAINMENT, DEFAULT_INPUTS, DEFAULT_RUNNING_COST_PRICES } from "@/lib/business-case";
import { emailBusinessCase } from "@/lib/services/business-case-report";
import { MockEmail, setEmailService, type EmailMessage, type EmailService } from "@/lib/services/email";

// E-mailing the quotation records it in the outbox and attaches the PDF; it
// refuses placeholder addresses and servers without an e-mail provider.

const prisma = new PrismaClient();
const testStart = new Date();
const TO = "buyer@assistance-company.com";

class RealProvider implements EmailService {
  readonly name = "real-test";
  readonly configured = true;
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
    return { id: `real_${this.sent.length}` };
  }
}

const input = {
  operation: DEFAULT_INPUTS,
  assumptions: DEFAULT_ASSUMPTIONS,
  prices: DEFAULT_RUNNING_COST_PRICES,
  costContainment: DEFAULT_COST_CONTAINMENT,
  quote: { preparedFor: "Assistance Company", services: [{ description: "Setup and configuration", amount: 6_000 }] },
};

afterEach(() => setEmailService(null));

afterAll(async () => {
  await prisma.outboundMessage.deleteMany({ where: { createdAt: { gte: testStart }, toAddress: TO } });
  await prisma.$disconnect();
});

describe("e-mailing the quotation", () => {
  it("sends the PDF with the summary, and records it in the outbox", async () => {
    const provider = new RealProvider();
    setEmailService(provider);
    const sent = await emailBusinessCase({ to: TO, input, operator: "presenter" });
    expect(sent).toMatchObject({ status: "SENT", channel: "EMAIL", toAddress: TO, provider: "real-test", automatic: false, approvedBy: "presenter" });

    const [message] = provider.sent;
    expect(message.subject).toMatch(/^CareTrail quotation Q-\d{8}-[0-9A-F]{4}$/);
    expect(message.text).toContain("Prepared for Assistance Company");
    expect(message.text).toContain("- Setup and configuration: €6,000");
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments![0]).toMatchObject({ type: "application/pdf" });
    expect(message.attachments![0].filename).toMatch(/^sthiram-caretrail-quotation-Q-\d{8}-[0-9A-F]{4}\.pdf$/);
    expect(message.attachments![0].content.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("refuses a placeholder address, which no mail would reach", async () => {
    setEmailService(new RealProvider());
    await expect(emailBusinessCase({ to: "visitor@example.com", input, operator: null })).rejects.toMatchObject({ status: 400 });
  });

  it("says plainly when the server has no e-mail provider", async () => {
    setEmailService(new MockEmail());
    await expect(emailBusinessCase({ to: TO, input, operator: null })).rejects.toMatchObject({ status: 503 });
  });
});
