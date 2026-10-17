import { afterEach, describe, expect, it } from "vitest";
import { MockEmail, emailServiceFor, isReservedAddress, parseSesMessageId, setEmailService, type EmailMessage, type EmailService } from "@/lib/services/email";

class RealProvider implements EmailService {
  readonly name = "real";
  readonly configured = true;
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
    return { id: "real_1" };
  }
}

afterEach(() => setEmailService(null));

describe("outbound e-mail", () => {
  it("knows the demo's fictional addresses from real ones", () => {
    for (const fictional of [
      "aylin@example.com",
      "Marmara Desk <desk@demo-heart.example>",
      "claims@inbound.demo-assistance.example",
      "someone@sub.example.org",
      "a@b.test",
      "nobody",
    ]) {
      expect(isReservedAddress(fictional), fictional).toBe(true);
    }
    for (const real of ["buyer@gmail.com", "Rajdeep <r@theranow.com>", "x@examples.com", "y@myexample.com", "z@company.com.tr"]) {
      expect(isReservedAddress(real), real).toBe(false);
    }
  });

  it("keeps fictional addresses away from a real provider", async () => {
    const real = new RealProvider();
    setEmailService(real);
    expect(emailServiceFor("buyer@gmail.com")).toBe(real);
    const simulated = emailServiceFor("desk@demo-heart.example");
    expect(simulated).not.toBe(real);
    expect(simulated.configured).toBe(false);
  });

  it("leaves a test's mock in charge of every address", () => {
    const mock = new MockEmail();
    setEmailService(mock);
    expect(emailServiceFor("desk@demo-heart.example")).toBe(mock);
    expect(emailServiceFor("buyer@gmail.com")).toBe(mock);
  });

  it("reads SES's message id from its SMTP reply", () => {
    expect(parseSesMessageId("250 Ok 0109019a1b2c3d4e-5f6a7b8c-9d0e-1f2a-3b4c-5d6e7f8a9b0c-000000")).toBe(
      "0109019a1b2c3d4e-5f6a7b8c-9d0e-1f2a-3b4c-5d6e7f8a9b0c-000000"
    );
    expect(parseSesMessageId("250 2.0.0 OK queued")).toBeNull();
    expect(parseSesMessageId(undefined)).toBeNull();
  });
});
