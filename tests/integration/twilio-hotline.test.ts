import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { PrismaClient } from "@prisma/client";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks";
import { createGateway } from "../../voice-gateway/gateway";
import { callerNumber, setTelephony, transferTwiml, type TelephonyService, type TransferInput } from "@/lib/services/telephony";
import { startFakeXai } from "../fakes/fake-xai";

// Inbound hotline end to end: Twilio webhook (signed) → TwiML media stream →
// gateway → Grok (scripted) → emergency → warm transfer with a whisper. And
// when Grok can't be reached or drops, the caller is redirected, not left in
// silence.

const AUTH_TOKEN = "test-auth-token";
const BASE = "https://demo.example.com";
const prisma = new PrismaClient();
const createdCallSids: string[] = [];
const testStart = new Date();

const transfers: TransferInput[] = [];
const redirects: { callSid: string; twiml: string }[] = [];
const hangups: string[] = [];
const fakeTelephony: TelephonyService = {
  name: "test",
  configured: true,
  fromNumber: "+15550100199",
  validateSignature: (sig, url, params) => sig === getExpectedTwilioSignature(AUTH_TOKEN, url, params),
  placeCall: async () => ({ sid: "CA_out" }),
  transfer: async (input) => {
    transfers.push(input);
  },
  redirect: async (callSid, twiml) => {
    redirects.push({ callSid, twiml });
  },
  hangup: async (sid) => {
    hangups.push(sid);
  },
  sendSms: async () => ({ sid: "SM_test" }),
  sendWhatsApp: async () => ({ sid: "WA_test" }),
  fetchMedia: async () => Buffer.alloc(0),
};

function signedRequest(path: string, params: Record<string, string>, { tamper = false } = {}) {
  const url = `${BASE}${path}`;
  const signature = getExpectedTwilioSignature(AUTH_TOKEN, url, params);
  return new Request(`http://app:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": tamper ? `${signature}x` : signature,
    },
    body: new URLSearchParams(params).toString(),
  });
}

let fake: Awaited<ReturnType<typeof startFakeXai>>;
let gateway: ReturnType<typeof createGateway>;
let gatewayUrl: string;

beforeAll(async () => {
  process.env.PUBLIC_BASE_URL = BASE;
  process.env.ON_CALL_DOCTOR_NUMBER = "+905550000111";
  setTelephony(fakeTelephony);
  fake = await startFakeXai();
  gateway = createGateway({ model: { url: fake.url, apiKey: "test-key" }, log: () => {} });
  await new Promise<void>((resolve) => gateway.server.listen(0, () => resolve()));
  gatewayUrl = `ws://127.0.0.1:${(gateway.server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await gateway.close();
  await fake.close();
  setTelephony(null);
  delete process.env.CASE_MANAGER_NUMBER;
  const calls = await prisma.call.findMany({ where: { twilioCallSid: { in: createdCallSids } } });
  const caseIds = calls.map((c) => c.caseId).filter((id): id is string => Boolean(id));
  const cases = await prisma.case.findMany({ where: { id: { in: caseIds } } });
  await prisma.call.deleteMany({ where: { id: { in: calls.map((c) => c.id) } } });
  await prisma.conversation.deleteMany({ where: { id: { in: calls.map((c) => c.conversationId!).filter(Boolean) } } });
  await prisma.case.deleteMany({ where: { id: { in: caseIds } } });
  await prisma.patient.deleteMany({ where: { id: { in: cases.map((c) => c.patientId) }, createdAt: { gte: testStart } } });
  await prisma.$disconnect();
});

describe("Twilio inbound webhook", () => {
  it("rejects requests without a valid Twilio signature", async () => {
    const { POST } = await import("@/app/api/twilio/voice/inbound/route");
    const res = await POST(signedRequest("/api/twilio/voice/inbound", { CallSid: "CA_forged", From: "+447700900001" }, { tamper: true }));
    expect(res.status).toBe(403);
    expect(await prisma.call.findUnique({ where: { twilioCallSid: "CA_forged" } })).toBeNull();
  });

  it("records the call and connects it to the gateway with a signed ticket", async () => {
    const { POST } = await import("@/app/api/twilio/voice/inbound/route");
    const sid = `CA_hook_${Date.now()}`;
    createdCallSids.push(sid);
    const res = await POST(signedRequest("/api/twilio/voice/inbound", { CallSid: sid, From: "+447700900002", To: "+15550100199" }));
    const xml = await res.text();
    expect(res.headers.get("content-type")).toContain("text/xml");
    expect(xml).toContain('<Stream url="wss://demo.example.com/ws/twilio">');
    expect(xml).toMatch(/<Parameter name="ticket" value="[^"]+"\/>/);
    const call = await prisma.call.findUniqueOrThrow({ where: { twilioCallSid: sid } });
    expect(call).toMatchObject({ direction: "INBOUND", channel: "PHONE", agentProfile: "inbound-hotline", status: "RINGING" });

    // Twilio retries webhooks: the same CallSid must not create a second call.
    await POST(signedRequest("/api/twilio/voice/inbound", { CallSid: sid, From: "+447700900002", To: "+15550100199" }));
    expect(await prisma.call.count({ where: { twilioCallSid: sid } })).toBe(1);
  });
});

describe("SIP connector (a contact centre's overflow over SIP)", () => {
  it("links the call to the case and language the contact centre passes in SIP headers", async () => {
    const { POST } = await import("@/app/api/twilio/voice/inbound/route");
    const sid = `CA_sip_${Date.now()}`;
    const res = await POST(
      signedRequest("/api/twilio/voice/inbound", {
        CallSid: sid,
        From: "sip:+447700900104@carrier.example;user=phone",
        To: "sip:overflow@demo.sip.twilio.com",
        "SipHeader_X-Case-Ref": "case-1024",
        "SipHeader_X-Language": "German",
      })
    );
    expect(await res.text()).toContain("<Stream");
    const call = await prisma.call.findUniqueOrThrow({ where: { twilioCallSid: sid }, include: { case: true } });
    expect(call).toMatchObject({ fromNumber: "+447700900104", language: "German" });
    expect(call.case?.ref).toBe("CASE-1024");
    await prisma.call.delete({ where: { id: call.id } });
  });

  it("transfers to a contact centre's SIP address, with the whisper", () => {
    const xml = transferTwiml({ number: "sip:overflow@acme.byoc.example", announcement: "Connecting you.", whisperUrl: "https://x/whisper", actionUrl: "https://x/dial" }, "+15550100199");
    expect(xml).toContain('<Sip url="https://x/whisper">sip:overflow@acme.byoc.example</Sip>');
    expect(transferTwiml({ number: "+905550000111", announcement: "Connecting you.", whisperUrl: "https://x/w", actionUrl: "https://x/d" }, null)).toContain("<Number");
    expect(callerNumber("sip:alice@pbx.example")).toBe("sip:alice@pbx.example");
    expect(callerNumber("+905550000111")).toBe("+905550000111");
  });
});

describe("Hotline emergency over a phone media stream", () => {
  it("triages, opens a critical case and warm-transfers to the on-call doctor with a whisper", async () => {
    const { POST: inbound } = await import("@/app/api/twilio/voice/inbound/route");
    const sid = `CA_emerg_${Date.now()}`;
    createdCallSids.push(sid);
    const xml = await (await inbound(signedRequest("/api/twilio/voice/inbound", { CallSid: sid, From: "+447700900003" }))).text();
    const ticket = xml.match(/name="ticket" value="([^"]+)"/)![1];

    // Twilio side of the media stream.
    const twilio = new WebSocket(`${gatewayUrl}/ws/twilio`);
    const fromGateway: Record<string, any>[] = [];
    twilio.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      fromGateway.push(msg);
      // Twilio echoes marks once the audio before them has played.
      if (msg.event === "mark") twilio.send(JSON.stringify({ event: "mark", streamSid: "MZ1", mark: msg.mark }));
    });
    await new Promise<void>((resolve) => twilio.once("open", () => resolve()));
    twilio.send(JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }));
    twilio.send(
      JSON.stringify({
        event: "start",
        start: { streamSid: "MZ1", callSid: sid, accountSid: "AC1", customParameters: { ticket } },
      })
    );

    const model = await fake.nextConnection();
    const update = await model.waitFor((e) => e.type === "session.update");
    expect(update.session.audio.input.format).toEqual({ type: "audio/pcmu" });
    expect(update.session.audio.output.format).toEqual({ type: "audio/pcmu" });
    // Silence is timed by the bridge from the end of playback, not by the model.
    expect(update.session.turn_detection.idle_timeout_ms).toBeUndefined();
    expect(update.session.tools.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining(["check_coverage", "transfer_to_human", "create_case"])
    );
    model.send({ type: "session.updated" });
    await model.waitFor((e) => JSON.stringify(e).includes("The call has connected"));
    model.say("Hello, this is Ada, an AI assistant on a demonstration line.");

    // Agent audio reaches the phone as μ-law media frames.
    const deadline = Date.now() + 3000;
    while (!fromGateway.some((m) => m.event === "media") && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(fromGateway.find((m) => m.event === "media")).toMatchObject({ streamSid: "MZ1" });

    // Caller audio flows to the model.
    twilio.send(JSON.stringify({ event: "media", streamSid: "MZ1", media: { track: "inbound", payload: "f39/" } }));
    expect((await model.waitFor((e) => e.type === "input_audio_buffer.append")).audio).toBe("f39/");

    // Emergency: critical case, then transfer.
    model.callFunction("create_case", {
      patient_name: "Phone Test Caller",
      location: "Sultanahmet, Istanbul",
      issue: "chest pain and shortness of breath",
      urgency: "CRITICAL",
      summary: "Traveller reports chest pain and shortness of breath. Advised to call 112.",
    });
    const created = JSON.parse((await model.waitFor((e) => e.item?.type === "function_call_output")).item.output);
    expect(created.case_ref).toMatch(/^CASE-\d+$/);

    model.callFunction("transfer_to_human", {
      target: "doctor",
      reason: "possible cardiac emergency",
      summary: "Chest pain and shortness of breath in Sultanahmet; told to call 112.",
    });
    const transferred = JSON.parse((await model.waitFor((e) => e.item?.type === "function_call_output")).item.output);
    expect(transferred.transferring).toBe(true);
    expect(transfers).toHaveLength(1);
    const call = await prisma.call.findUniqueOrThrow({ where: { twilioCallSid: sid } });
    expect(transfers[0]).toMatchObject({ callSid: sid, number: "+905550000111" });
    expect(transfers[0].whisperUrl).toBe(`${BASE}/api/twilio/voice/whisper?callId=${call.id}`);

    // The doctor's whisper reads the AI handoff summary.
    const { POST: whisper } = await import("@/app/api/twilio/voice/whisper/route");
    const whisperXml = await (await whisper(signedRequest(`/api/twilio/voice/whisper?callId=${call.id}`, { CallSid: "CA_doc" }))).text();
    expect(whisperXml).toContain("Chest pain and shortness of breath");
    expect(whisperXml).toContain(created.case_ref.replace("-", " "));

    // Twilio ends the stream when the call moves to <Dial>.
    twilio.send(JSON.stringify({ event: "stop", streamSid: "MZ1", stop: { accountSid: "AC1", callSid: sid } }));
    let final = call;
    for (let i = 0; i < 50 && !final.endedAt; i++) {
      await new Promise((r) => setTimeout(r, 100));
      final = await prisma.call.findUniqueOrThrow({ where: { twilioCallSid: sid } });
    }
    expect(final.status).toBe("TRANSFERRED");
    expect(final.transferredTo).toBe("doctor");
    const kase = await prisma.case.findUniqueOrThrow({ where: { ref: created.case_ref }, include: { events: true } });
    expect(kase.priority).toBe("CRITICAL");
    expect(kase.events.some((e) => e.type === "CALL" && /on-call doctor/.test(e.title))).toBe(true);
    twilio.close();
  });

  it("refuses a media stream whose ticket doesn't match the call", async () => {
    const twilio = new WebSocket(`${gatewayUrl}/ws/twilio`);
    await new Promise<void>((resolve) => twilio.once("open", () => resolve()));
    const closed = new Promise<void>((resolve) => twilio.once("close", () => resolve()));
    twilio.send(
      JSON.stringify({ event: "start", start: { streamSid: "MZ9", callSid: "CA_x", accountSid: "AC1", customParameters: { ticket: "bogus.ticket" } } })
    );
    await closed;
  });
});

/** Rings the hotline (signed webhook) and opens the call's media stream on `url`, as Twilio would. */
async function ringHotline(url: string, from: string) {
  const { POST: inbound } = await import("@/app/api/twilio/voice/inbound/route");
  const sid = `CA_fallback_${from.slice(-4)}_${Date.now()}`;
  createdCallSids.push(sid);
  const xml = await (await inbound(signedRequest("/api/twilio/voice/inbound", { CallSid: sid, From: from }))).text();
  const ticket = xml.match(/name="ticket" value="([^"]+)"/)![1];
  const twilio = new WebSocket(`${url}/ws/twilio`);
  const closed = new Promise<void>((resolve) => twilio.once("close", () => resolve()));
  await new Promise<void>((resolve) => twilio.once("open", () => resolve()));
  twilio.send(JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }));
  twilio.send(
    JSON.stringify({ event: "start", start: { streamSid: "MZ2", callSid: sid, accountSid: "AC1", customParameters: { ticket } } })
  );
  return { sid, closed };
}

/** The call once the session has closed its books. */
async function finished(sid: string) {
  let call = await prisma.call.findUniqueOrThrow({ where: { twilioCallSid: sid } });
  for (let i = 0; i < 50 && !call.endedAt; i++) {
    await new Promise((r) => setTimeout(r, 100));
    call = await prisma.call.findUniqueOrThrow({ where: { twilioCallSid: sid } });
  }
  return call;
}

describe("Phone callers when the voice model is unavailable", () => {
  let deadGateway: ReturnType<typeof createGateway>;
  let deadGatewayUrl: string;

  beforeAll(async () => {
    // A port nobody listens on: the model connection is refused at once.
    const probe = net.createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", () => resolve()));
    const port = (probe.address() as net.AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    deadGateway = createGateway({ model: { url: `ws://127.0.0.1:${port}`, apiKey: "test-key" }, log: () => {} });
    await new Promise<void>((resolve) => deadGateway.server.listen(0, () => resolve()));
    deadGatewayUrl = `ws://127.0.0.1:${(deadGateway.server.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    await deadGateway.close();
  });

  it("apologises and warm-transfers to the case manager when the model can't be reached", async () => {
    process.env.CASE_MANAGER_NUMBER = "+905550000222";
    const { sid, closed } = await ringHotline(deadGatewayUrl, "+447700900004");
    const call = await finished(sid);
    await closed;

    const twiml = redirects.find((r) => r.callSid === sid)?.twiml ?? "";
    expect(twiml).toMatch(/<Say[^>]*>We're sorry, our assistant is unavailable right now\. Connecting you to a case manager\./);
    expect(twiml).toMatch(/<Dial [^>]*action="https:\/\/demo\.example\.com\/api\/twilio\/voice\/dial-result\?callId=[^"]+"/);
    expect(twiml).toContain(`<Number url="${BASE}/api/twilio/voice/whisper?callId=${call.id}">+905550000222</Number></Dial>`);
    expect(twiml.indexOf("<Say")).toBeLessThan(twiml.indexOf("<Dial"));

    expect(call).toMatchObject({ status: "TRANSFERRED", transferredTo: "case_manager" });
    expect(call.outcome).toMatchObject({ endReason: "voice model unavailable", handoff: { target: "case_manager" } });

    // The case manager hears why the caller reaches them untriaged.
    const { POST: whisper } = await import("@/app/api/twilio/voice/whisper/route");
    const whisperXml = await (await whisper(signedRequest(`/api/twilio/voice/whisper?callId=${call.id}`, { CallSid: "CA_cm" }))).text();
    expect(whisperXml).toContain("AI assistant unavailable");
  });

  it("asks the caller to call back when there is no case manager to dial", async () => {
    delete process.env.CASE_MANAGER_NUMBER;
    const { sid, closed } = await ringHotline(deadGatewayUrl, "+447700900005");
    const call = await finished(sid);
    await closed;

    const twiml = redirects.find((r) => r.callSid === sid)?.twiml ?? "";
    expect(twiml).toMatch(/<Say[^>]*>We're sorry[^<]*call us back[^<]*<\/Say><Hangup\/>/);
    expect(twiml).not.toContain("<Dial");
    expect(call).toMatchObject({ status: "FAILED", transferredTo: null });
    expect(call.outcome).toMatchObject({ endReason: "voice model unavailable" });
  });

  it("hands the caller over when the model drops mid-call", async () => {
    process.env.CASE_MANAGER_NUMBER = "+905550000222";
    const { sid, closed } = await ringHotline(gatewayUrl, "+447700900006");
    const model = await fake.nextConnection();
    await model.waitFor((e) => e.type === "session.update");
    model.send({ type: "session.updated" });
    await model.waitFor((e) => JSON.stringify(e).includes("The call has connected"));
    expect(redirects.some((r) => r.callSid === sid)).toBe(false);

    model.close();
    const call = await finished(sid);
    await closed;

    const twiml = redirects.find((r) => r.callSid === sid)?.twiml ?? "";
    expect(twiml).toMatch(/<Say[^>]*>We're sorry, our assistant is unavailable/);
    expect(twiml).toContain(">+905550000222</Number></Dial>");
    expect(call).toMatchObject({ status: "TRANSFERRED", transferredTo: "case_manager" });
    expect(call.outcome).toMatchObject({ endReason: "voice model disconnected" });
  });
});
