import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { PrismaClient } from "@prisma/client";
import { createGateway } from "../../voice-gateway/gateway";
import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { setTelephony, type TelephonyService } from "@/lib/services/telephony";
import { startFakeXai, type FakeConnection } from "../fakes/fake-xai";

const HOSPITAL = "+905550001111";
const prisma = new PrismaClient();
const testStart = new Date();
const hangups: string[] = [];

const fakeTelephony: TelephonyService = {
  name: "test",
  configured: true,
  fromNumber: "+15550100199",
  validateSignature: () => true,
  placeCall: async () => ({ sid: `CA_interp_${Date.now()}` }),
  transfer: async () => undefined,
  redirect: async () => undefined,
  hangup: async (sid) => void hangups.push(sid),
  sendSms: async () => ({ sid: "SM" }),
};

let fake: Awaited<ReturnType<typeof startFakeXai>>;
let gateway: ReturnType<typeof createGateway>;
let gatewayUrl: string;

beforeAll(async () => {
  process.env.PUBLIC_BASE_URL = "https://demo.example.com";
  process.env.OUTBOUND_ALLOWED_NUMBERS = HOSPITAL;
  process.env.XAI_API_KEY = "test-key";
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
  const calls = await prisma.call.findMany({ where: { createdAt: { gte: testStart } } });
  await prisma.call.deleteMany({ where: { id: { in: calls.map((c) => c.id) } } });
  await prisma.conversation.deleteMany({ where: { id: { in: calls.map((c) => c.conversationId!).filter(Boolean) } } });
  await prisma.caseEvent.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.$disconnect();
});

const until = async (check: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  expect(check()).toBe(true);
};

describe("live interpreter bridge", () => {
  it("connects manager (browser, EN) and hospital (phone, TR) through two one-way translation sessions", async () => {
    const kase = await prisma.case.findUniqueOrThrow({ where: { ref: "CASE-1013" } });
    const { POST } = await import("@/app/api/calls/interpreter/route");
    const res = await POST(
      new Request("http://app/api/calls/interpreter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: kase.id, hospitalNumber: HOSPITAL, hospitalLanguage: "tr" }),
      }),
      {}
    );
    expect(res.status).toBe(201);
    const started = await res.json();
    expect(started.languages).toEqual(["English", "Turkish"]);
    const legs = await prisma.call.findMany({ where: { bridgeId: started.bridgeId } });
    expect(legs.map((c) => c.channel).sort()).toEqual(["BROWSER", "PHONE"]);
    const hospitalCall = legs.find((c) => c.channel === "PHONE")!;

    // Manager joins from the browser while the hospital rings.
    const managerEvents: Record<string, any>[] = [];
    const manager = new WebSocket(started.url.replace(/^ws:\/\/[^/]+/, gatewayUrl));
    manager.on("message", (raw) => managerEvents.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve) => manager.once("open", () => resolve()));
    await until(() => managerEvents.some((e) => e.type === "bridge_status" && e.status === "ringing"));

    // Hospital answers: its media stream joins the bridge.
    const hospitalFrames: Record<string, any>[] = [];
    const hospital = new WebSocket(`${gatewayUrl}/ws/twilio`);
    hospital.on("message", (raw) => hospitalFrames.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve) => hospital.once("open", () => resolve()));
    const ticket = await signToken({ kind: "twilio-media", callId: hospitalCall.id, profile: "interpreter" }, gatewaySecret(), 60);
    hospital.send(
      JSON.stringify({ event: "start", start: { streamSid: "MZ7", callSid: hospitalCall.twilioCallSid, accountSid: "AC1", customParameters: { ticket } } })
    );

    // Two model sessions: identify them by their instructions.
    const sessions: FakeConnection[] = [await fake.nextConnection(), await fake.nextConnection()];
    const updates = await Promise.all(sessions.map((s) => s.waitFor((e) => e.type === "session.update")));
    const abIdx = updates.findIndex((u) => u.session.instructions.includes("from English into Turkish"));
    const ab = sessions[abIdx];
    const ba = sessions[1 - abIdx];
    const abUpdate = updates[abIdx];
    const baUpdate = updates[1 - abIdx];
    expect(abUpdate.session.audio.input.format).toEqual({ type: "audio/pcm", rate: 24000 });
    expect(abUpdate.session.audio.output.format).toEqual({ type: "audio/pcmu" });
    expect(abUpdate.session.audio.input.transcription.language_hint).toBe("en");
    expect(abUpdate.session.reasoning).toEqual({ effort: "none" });
    expect(baUpdate.session.audio.input.format).toEqual({ type: "audio/pcmu" });
    expect(baUpdate.session.audio.output.format).toEqual({ type: "audio/pcm", rate: 24000 });
    expect(baUpdate.session.audio.input.transcription.language_hint).toBe("tr");
    expect(abUpdate.session.tools).toBeUndefined();
    ab.send({ type: "session.updated" });
    ba.send({ type: "session.updated" });
    await until(() => managerEvents.some((e) => e.type === "bridge_status" && e.status === "connected"));

    // The hospital first hears a translated introduction.
    await ab.waitFor((e) => e.type === "conversation.item.create" && JSON.stringify(e).includes("AI interpreter"));

    // Manager speaks → session A → hospital hears the Turkish audio.
    manager.send(JSON.stringify({ type: "audio", data: "TUFOQUdFUg==" }));
    expect((await ab.waitFor((e) => e.type === "input_audio_buffer.append")).audio).toBe("TUFOQUdFUg==");
    ab.send({ type: "conversation.item.input_audio_transcription.completed", transcript: "Is the patient admitted?" });
    ab.say("Hasta yatırıldı mı?");
    await until(() => hospitalFrames.some((f) => f.event === "media" && f.streamSid === "MZ7"));

    // Hospital answers → session B → manager hears English.
    hospital.send(JSON.stringify({ event: "media", streamSid: "MZ7", media: { track: "inbound", payload: "SE9TUA==" } }));
    expect((await ba.waitFor((e) => e.type === "input_audio_buffer.append")).audio).toBe("SE9TUA==");
    ba.send({ type: "conversation.item.input_audio_transcription.completed", transcript: "Evet, kardiyoloji servisinde." });
    ba.say("Yes, in the cardiology ward.");
    await until(() => managerEvents.some((e) => e.type === "audio"));
    await until(() => managerEvents.filter((e) => e.type === "caption").length >= 4);
    const captions = managerEvents.filter((e) => e.type === "caption").map((e) => `${e.side}/${e.kind}: ${e.text}`);
    expect(captions).toEqual(
      expect.arrayContaining([
        "manager/original: Is the patient admitted?",
        "manager/translation: Hasta yatırıldı mı?",
        "hospital/original: Evet, kardiyoloji servisinde.",
        "hospital/translation: Yes, in the cardiology ward.",
      ])
    );

    // Manager hangs up → hospital call ended, both legs closed out, case timeline updated.
    manager.send(JSON.stringify({ type: "hangup" }));
    await until(() => hangups.includes(hospitalCall.twilioCallSid!));
    let legsAfter = await prisma.call.findMany({ where: { bridgeId: started.bridgeId } });
    for (let i = 0; i < 50 && legsAfter.some((c) => !c.endedAt); i++) {
      await new Promise((r) => setTimeout(r, 100));
      legsAfter = await prisma.call.findMany({ where: { bridgeId: started.bridgeId } });
    }
    expect(legsAfter.every((c) => c.status === "COMPLETED")).toBe(true);
    const managerLeg = legsAfter.find((c) => c.channel === "BROWSER")!;
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: managerLeg.conversationId! } });
    expect(JSON.stringify(conversation.messages)).toContain("kardiyoloji");
    expect(await prisma.caseEvent.count({ where: { caseId: kase.id, title: "Interpreted call with the hospital" } })).toBeGreaterThan(0);
    hospital.close();
  });
});
