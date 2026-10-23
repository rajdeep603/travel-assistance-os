import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { PrismaClient } from "@prisma/client";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks";
import { createGateway } from "../../voice-gateway/gateway";
import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { placeOutboundCall, retryUnansweredCalls } from "@/lib/services/outbound-calls";
import { setTelephony, type PlaceCallInput, type TelephonyService } from "@/lib/services/telephony";
import { zonedToUtc, zonedToday } from "@/lib/time";
import { startFakeXai } from "../fakes/fake-xai";

const AUTH_TOKEN = "test-auth-token";
const BASE = "https://demo.example.com";
const HOSPITAL = "+905550001111";
const TRAVELLER = "+447700900123";
const prisma = new PrismaClient();
const testStart = new Date();
const placed: PlaceCallInput[] = [];
const sms: { to: string; body: string }[] = [];

const fakeTelephony: TelephonyService = {
  name: "test",
  configured: true,
  fromNumber: "+15550100199",
  validateSignature: (sig, url, params) => sig === getExpectedTwilioSignature(AUTH_TOKEN, url, params),
  placeCall: async (input) => {
    placed.push(input);
    return { sid: `CA_out_${Date.now()}_${placed.length}` };
  },
  transfer: async () => undefined,
  redirect: async () => undefined,
  hangup: async () => undefined,
  sendSms: async (to, body) => {
    sms.push({ to, body });
    return { sid: "SM1" };
  },
  sendWhatsApp: async () => ({ sid: "WA1" }),
  fetchMedia: async () => Buffer.alloc(0),
};

function signed(pathWithQuery: string, params: Record<string, string>) {
  return new Request(`http://app:3000${pathWithQuery}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": getExpectedTwilioSignature(AUTH_TOKEN, `${BASE}${pathWithQuery}`, params),
    },
    body: new URLSearchParams(params).toString(),
  });
}

const noon = zonedToUtc(zonedToday(0), "12:00");

let fake: Awaited<ReturnType<typeof startFakeXai>>;
let gateway: ReturnType<typeof createGateway>;
let gatewayUrl: string;
let caseId: string;

beforeAll(async () => {
  process.env.PUBLIC_BASE_URL = BASE;
  process.env.OUTBOUND_ALLOWED_NUMBERS = `${HOSPITAL},${TRAVELLER}`;
  setTelephony(fakeTelephony);
  fake = await startFakeXai();
  gateway = createGateway({ model: { url: fake.url, apiKey: "test-key" }, log: () => {} });
  await new Promise<void>((resolve) => gateway.server.listen(0, () => resolve()));
  const port = (gateway.server.address() as { port: number }).port;
  gatewayUrl = `ws://127.0.0.1:${port}`;
  process.env.VOICE_GATEWAY_INTERNAL_URL = `http://127.0.0.1:${port}`;
  caseId = (await prisma.case.findUniqueOrThrow({ where: { ref: "CASE-1013" } })).id;
});

afterAll(async () => {
  await gateway.close();
  await fake.close();
  setTelephony(null);
  const calls = await prisma.call.findMany({ where: { createdAt: { gte: testStart } } });
  await prisma.call.deleteMany({ where: { id: { in: calls.map((c) => c.id) } } });
  await prisma.conversation.deleteMany({ where: { id: { in: calls.map((c) => c.conversationId!).filter(Boolean) } } });
  await prisma.caseEvent.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.document.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.$disconnect();
});

describe("placing outbound calls", () => {
  it("only dials allowlisted numbers", async () => {
    await expect(
      placeOutboundCall({ profileId: "outbound-hospital-coordination", caseId, to: "+905559999999", placedBy: "elif" })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("calls travellers at any hour", async () => {
    const call = await placeOutboundCall({ profileId: "outbound-appointment-reminder", caseId, to: TRAVELLER, placedBy: "elif" });
    expect(call.status).toBe("RINGING");
    // Free the line for the tests below (concurrency cap).
    await prisma.call.update({ where: { id: call.id }, data: { status: "COMPLETED", endedAt: new Date() } });
  });

  it("places the call with answering-machine detection and a case brief", async () => {
    const call = await placeOutboundCall({ profileId: "outbound-hospital-coordination", caseId, to: HOSPITAL, placedBy: "elif" });
    expect(call.status).toBe("RINGING");
    expect(call.twilioCallSid).toMatch(/^CA_out_/);
    const last = placed.at(-1)!;
    expect(last.to).toBe(HOSPITAL);
    expect(last.url).toBe(`${BASE}/api/twilio/voice/outbound?callId=${call.id}`);
    expect(last.amdCallback).toBe(`${BASE}/api/twilio/voice/amd?callId=${call.id}`);
    const brief = (call.outcome as { brief: Record<string, string> }).brief;
    expect(brief.case).toBe("CASE-1013");
    expect(brief.patient).toContain("Oliver Bennett");
    const event = await prisma.caseEvent.findFirst({ where: { caseId, title: { contains: call.ref } } });
    expect(event?.actor).toBe("operator:elif");
  });

  it("answers Twilio with a media stream for the call", async () => {
    const call = await placeOutboundCall({ profileId: "outbound-hospital-coordination", caseId, to: HOSPITAL, placedBy: "elif" });
    const { POST } = await import("@/app/api/twilio/voice/outbound/route");
    const xml = await (await POST(signed(`/api/twilio/voice/outbound?callId=${call.id}`, { CallSid: call.twilioCallSid! }))).text();
    expect(xml).toContain('<Stream url="wss://demo.example.com/ws/twilio">');
    expect(xml).toMatch(/name="ticket"/);
  });
});

describe("outbound session: hospital coordination in Turkish", () => {
  it("speaks first, records a structured hospital update, and switches to voicemail on a machine", async () => {
    const call = await placeOutboundCall({ profileId: "outbound-hospital-coordination", caseId, to: HOSPITAL, placedBy: "elif" });
    const ticket = await signToken({ kind: "twilio-media", callId: call.id, profile: call.agentProfile }, gatewaySecret(), 60);
    const twilio = new WebSocket(`${gatewayUrl}/ws/twilio`);
    twilio.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === "mark") twilio.send(JSON.stringify({ event: "mark", streamSid: "MZ2", mark: msg.mark }));
    });
    await new Promise<void>((resolve) => twilio.once("open", () => resolve()));
    twilio.send(JSON.stringify({ event: "start", start: { streamSid: "MZ2", callSid: call.twilioCallSid, accountSid: "AC1", customParameters: { ticket } } }));

    const model = await fake.nextConnection();
    const update = await model.waitFor((e) => e.type === "session.update");
    expect(update.session.audio.input.transcription.language_hint).toBe("tr");
    expect(update.session.voice).toBe("ara");
    expect(update.session.instructions).toContain("CASE-1013");
    expect(update.session.instructions).toContain("Turkish");
    model.send({ type: "session.updated" });
    await model.waitFor((e) => JSON.stringify(e).includes("The call has been answered"));

    model.callFunction("record_hospital_update", {
      admitted: true,
      ward: "Cardiology 3B",
      attending_doctor: "Dr. Mehmet Aydin",
      estimated_cost: 84500,
      currency: "TRY",
      report_eta: "tomorrow 10:00",
      guarantee_requested: true,
    });
    const saved = JSON.parse((await model.waitFor((e) => e.item?.type === "function_call_output")).item.output);
    expect(saved.saved).toBe(true);
    const note = await prisma.caseEvent.findFirstOrThrow({ where: { caseId, title: `Hospital update from ${call.ref}` } });
    expect(note.body).toContain("estimated cost 84,500 TRY");
    expect(note.data).toMatchObject({ ward: "Cardiology 3B", guarantee_requested: true });

    // Twilio's async AMD reports a machine → the agent is told to leave a voicemail.
    const { POST: amd } = await import("@/app/api/twilio/voice/amd/route");
    await amd(signed(`/api/twilio/voice/amd?callId=${call.id}`, { CallSid: call.twilioCallSid!, AnsweredBy: "machine_end_beep" }));
    await model.waitFor((e) => JSON.stringify(e).includes("answering machine"));

    twilio.send(JSON.stringify({ event: "stop", streamSid: "MZ2", stop: { accountSid: "AC1", callSid: call.twilioCallSid } }));
    let final = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    for (let i = 0; i < 50 && !final.endedAt; i++) {
      await new Promise((r) => setTimeout(r, 100));
      final = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    }
    expect(final.status).toBe("VOICEMAIL");
    expect(final.outcome).toMatchObject({ answeredBy: "machine_end_beep", hospitalUpdate: { ward: "Cardiology 3B" } });
    twilio.close();
  });
});

describe("retries", () => {
  it("retries an unanswered call once, and only once", async () => {
    // Earlier tests left calls "ringing"; free the lines (the cap is 5).
    await prisma.call.updateMany({ where: { createdAt: { gte: testStart }, status: "RINGING" }, data: { status: "COMPLETED" } });
    const call = await placeOutboundCall({ profileId: "outbound-hospital-coordination", caseId, to: HOSPITAL, placedBy: "elif" });
    const longAgo = new Date(noon.getTime() - 45 * 60_000);
    await prisma.call.update({ where: { id: call.id }, data: { status: "NO_ANSWER", endedAt: longAgo } });
    const before = placed.length;
    expect(await retryUnansweredCalls(noon)).toBeGreaterThanOrEqual(1);
    expect(placed.length).toBeGreaterThan(before);
    const original = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    const retriedAs = (original.outcome as { retriedAs?: string }).retriedAs!;
    const retry = await prisma.call.findUniqueOrThrow({ where: { ref: retriedAs } });
    expect(retry.outcome).toMatchObject({ retryOf: call.id, retries: 1 });

    // The retry also goes unanswered: no third attempt.
    await prisma.call.update({ where: { id: retry.id }, data: { status: "NO_ANSWER", endedAt: longAgo } });
    const count = placed.length;
    await retryUnansweredCalls(noon);
    expect(placed.length).toBe(count);
  });
});

describe("claimant upload link", () => {
  it("texts a signed link that lets the claimant add documents to the claim", async () => {
    const claim = await prisma.claim.findUniqueOrThrow({ where: { ref: "CLM-10245" } });
    const claimCase = claim.caseId!;
    const { executeTool } = await import("@/lib/voice/tools/registry");
    const outcome: Record<string, unknown> = {};
    const result = await executeTool(
      "send_upload_link",
      { phone: TRAVELLER },
      {
        callId: "x",
        callRef: "CALL-TEST",
        conversationId: "x",
        profileId: "outbound-claim-missing-info",
        channel: "PHONE",
        caseId: claimCase,
        patientId: claim.patientId,
        setCase: async () => undefined,
        setOutcome: async (p) => void Object.assign(outcome, p),
        emit: () => undefined,
        actions: { hangup: async () => undefined, transfer: async () => ({ ok: false, message: "" }) },
      },
      ["send_upload_link"]
    );
    expect(result.sent).toBe(true);
    const text = sms.at(-1)!;
    expect(text.to).toBe(TRAVELLER);
    const token = text.body.match(/\/upload\/(\S+)/)![1];

    const route = await import("@/app/api/public/upload/[token]/route");
    const view = await (await route.GET(new Request("http://app/x"), { params: { token } })).json();
    expect(view.claim.ref).toBe("CLM-10245");

    const pdf = fs.readFileSync(path.join(process.cwd(), "public/demo-documents/discharge-summary-aylin-yilmaz.pdf"));
    const form = new FormData();
    form.append("files", new File([pdf], "discharge.pdf", { type: "application/pdf" }));
    const res = await route.POST(new Request("http://app/x", { method: "POST", body: form }), { params: { token } });
    expect(res.status).toBe(200);
    expect(await prisma.document.count({ where: { claimId: claim.id, filename: "discharge.pdf" } })).toBe(1);

    const forged = await route.GET(new Request("http://app/x"), { params: { token: `${token}x` } });
    expect(forged.status).toBe(404);
  });
});
