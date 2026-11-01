import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { placeOutboundCall } from "@/lib/services/outbound-calls";
import { setTelephony, type PlaceCallInput, type TelephonyService } from "@/lib/services/telephony";
import { getAgent, listAgents } from "@/lib/voice/agents/registry";
import { getTool } from "@/lib/voice/tools/registry";

// The provider-validation agent: placed through the public API with a brief
// the caller supplies (a client's provider-network tool), hidden from the
// pickers, briefed on the practice to check, with tools to record what it
// learned and to send the price-list link.

const prisma = new PrismaClient();
const PRACTICE = "+14075550123";
const placed: PlaceCallInput[] = [];
const sms: { to: string; body: string }[] = [];
const created: string[] = [];

const fakeTelephony: TelephonyService = {
  name: "test",
  configured: true,
  fromNumber: "+15550100199",
  validateSignature: () => true,
  placeCall: async (input) => {
    placed.push(input);
    return { sid: `CA_pv_${placed.length}` };
  },
  transfer: async () => undefined,
  redirect: async () => undefined,
  hangup: async () => undefined,
  sendSms: async (to, body) => {
    sms.push({ to, body });
    return { sid: "SM_pv" };
  },
  sendWhatsApp: async () => ({ sid: "WA" }),
  fetchMedia: async () => Buffer.alloc(0),
};

const BRIEF = {
  client: "HAS Companies (Health Access Services), an assistance company",
  provider_name: "Lakeside Urgent Care",
  address: "4820 International Dr, Orlando, FL 32819",
  services_to_confirm: ["Urgent care", "X-ray"],
  prices_to_ask: ["Urgent care visit", "X-ray (one region)"],
  price_list_link: "https://hascompanies.example.com/p/abc123",
  reference: "HAS-1042",
};

describe("provider validation through the API", () => {
  beforeAll(() => {
    process.env.PUBLIC_BASE_URL = "https://demo.example.com";
    process.env.OUTBOUND_ALLOWED_NUMBERS = PRACTICE;
    setTelephony(fakeTelephony);
  });
  afterAll(async () => {
    setTelephony(null);
    await prisma.call.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  it("is an outbound, API-only agent that the pickers don't offer", () => {
    const agent = getAgent("outbound-provider-validation")!;
    expect(agent.direction).toBe("outbound");
    expect(agent.apiOnly).toBe(true);
    expect(agent.requiresCase).toBeFalsy();
    expect(listAgents().some((a) => a.id === agent.id)).toBe(false);
    expect(getTool("record_provider_validation")).toBeDefined();
    expect(getTool("send_price_list_link")).toBeDefined();
  });

  it("dials the practice with the supplied brief and keeps the caller's reference", async () => {
    const call = await placeOutboundCall({ profileId: "outbound-provider-validation", to: PRACTICE, brief: BRIEF, clientRef: "HAS-1042", placedBy: "api:has-poc" });
    created.push(call.id);
    expect(call.status).toBe("RINGING");
    expect(placed.at(-1)?.to).toBe(PRACTICE);
    const outcome = call.outcome as { brief: typeof BRIEF; clientRef: string; fit?: unknown };
    expect(outcome.brief.provider_name).toBe("Lakeside Urgent Care");
    expect(outcome.clientRef).toBe("HAS-1042");
    expect(outcome.fit).toBeUndefined();

    const agent = getAgent("outbound-provider-validation")!;
    const text = agent.instructions({ callRef: call.ref, channel: "PHONE", today: "2026-11-02", weekday: "Monday", time: "10:00", brief: outcome.brief, language: "English" });
    expect(text).toContain("Lakeside Urgent Care");
    expect(text).toContain("hascompanies.example.com/p/abc123");
    expect(text).toMatch(/AI assistant/);
    expect(text).toMatch(/never negotiate/i);
  });

  it("sends the price-list link from the brief by text message and records it on the call", async () => {
    const call = await placeOutboundCall({ profileId: "outbound-provider-validation", to: PRACTICE, brief: BRIEF, clientRef: "HAS-1042", placedBy: "api:has-poc" });
    created.push(call.id);
    const outcome: Record<string, unknown> = {};
    const ctx = {
      callId: call.id,
      callRef: call.ref,
      conversationId: "pv-test",
      profileId: "outbound-provider-validation",
      channel: "PHONE" as const,
      caseId: null,
      patientId: null,
      async setCase() {},
      async setOutcome(patch: Record<string, unknown>) {
        Object.assign(outcome, patch);
      },
      emit() {},
      actions: { async hangup() {}, async transfer() { return { ok: false, message: "" }; } },
    };
    const sent = await getTool("send_price_list_link")!.execute({ channel: "sms", to: "+1 (407) 555-0123" }, ctx);
    expect(sent).toEqual({ sent: true });
    expect(sms.at(-1)?.to).toBe(PRACTICE);
    expect(sms.at(-1)?.body).toContain("hascompanies.example.com/p/abc123");
    expect(outcome.priceLinkSent).toMatchObject({ channel: "sms", sent: true });

    const recorded = await getTool("record_provider_validation")!.execute(
      { reached_right_place: true, operating: true, hours: "7am to 10pm daily", services_confirmed: ["Urgent care", "X-ray"], accepts_direct_billing: true, prices: [{ item: "Urgent care visit", amount: 165, currency: "USD" }], contact_name: "Maria", contact_role: "front desk" },
      ctx
    );
    expect(recorded).toEqual({ saved: true });
    expect((outcome.providerValidation as { prices: unknown[] }).prices).toHaveLength(1);
  });
});
