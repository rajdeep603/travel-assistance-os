import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { PrismaClient } from "@prisma/client";
import { createGateway } from "../../voice-gateway/gateway";
import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { nextRef } from "@/lib/refs";
import { addDays, weekdayKey, zonedToday } from "@/lib/time";
import { startFakeXai } from "../fakes/fake-xai";

// Runs a complete browser voice session through the real gateway, bridge,
// tools and database, with a scripted stand-in for the Grok Voice API.

const prisma = new PrismaClient();
let fake: Awaited<ReturnType<typeof startFakeXai>>;
let gateway: ReturnType<typeof createGateway>;
let gatewayUrl: string;
const createdCalls: string[] = [];
const testStart = new Date();

function weekdayAhead(days: number): string {
  let d = zonedToday(days);
  while (weekdayKey(d) === "sat" || weekdayKey(d) === "sun") d = addDays(d, 1);
  return d;
}

beforeAll(async () => {
  fake = await startFakeXai();
  gateway = createGateway({ model: { url: fake.url, apiKey: "test-key", name: "grok-voice-3.0" }, log: () => {} });
  await new Promise<void>((resolve) => gateway.server.listen(0, () => resolve()));
  gatewayUrl = `ws://127.0.0.1:${(gateway.server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await gateway.close();
  await fake.close();
  const calls = await prisma.call.findMany({ where: { id: { in: createdCalls } } });
  const caseIds = calls.map((c) => c.caseId).filter((id): id is string => Boolean(id));
  const cases = await prisma.case.findMany({ where: { id: { in: caseIds } } });
  await prisma.appointment.deleteMany({ where: { caseId: { in: caseIds } } });
  await prisma.call.deleteMany({ where: { id: { in: createdCalls } } });
  await prisma.conversation.deleteMany({ where: { id: { in: calls.map((c) => c.conversationId!).filter(Boolean) } } });
  await prisma.case.deleteMany({ where: { id: { in: caseIds } } });
  // Only patients this test created (voice bookings register new travellers).
  await prisma.patient.deleteMany({ where: { id: { in: cases.map((c) => c.patientId) }, createdAt: { gte: testStart } } });
  await prisma.$disconnect();
});

async function newBrowserCall() {
  const call = await prisma.call.create({
    data: {
      ref: await nextRef("call"),
      direction: "INBOUND",
      channel: "BROWSER",
      agentProfile: "appointment-booking",
    },
  });
  createdCalls.push(call.id);
  const ticket = await signToken({ kind: "browser-voice", callId: call.id, profile: "appointment-booking" }, gatewaySecret(), 60);
  const events: Record<string, any>[] = [];
  const ws = new WebSocket(`${gatewayUrl}/ws/voice?ticket=${encodeURIComponent(ticket)}`);
  ws.on("message", (raw) => events.push(JSON.parse(raw.toString())));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const waitForEvent = async (match: (e: Record<string, any>) => boolean, timeoutMs = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const hit = events.find(match);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`browser: timed out; got ${events.map((e) => e.type).join(", ")}`);
  };
  return { call, ws, events, waitForEvent };
}

describe("voice gateway (browser session)", () => {
  it("rejects connections without a valid ticket", async () => {
    const ws = new WebSocket(`${gatewayUrl}/ws/voice?ticket=forged.token`);
    const status = await new Promise<number>((resolve) => {
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.on("open", () => resolve(101));
    });
    expect(status).toBe(401);
  });

  it("configures Grok, greets, searches, books on confirmation and files everything on a case", async () => {
    const browser = await newBrowserCall();
    const model = await fake.nextConnection();

    // Session configuration: pinned model, browser PCM audio, server VAD, the agent's tools.
    expect(model.url).toContain("model=grok-voice-3.0");
    expect(model.headers.authorization).toBe("Bearer test-key");
    const update = await model.waitFor((e) => e.type === "session.update");
    expect(update.session.audio.input.format).toEqual({ type: "audio/pcm", rate: 24000 });
    expect(update.session.turn_detection.type).toBe("server_vad");
    const toolNames = update.session.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toEqual(expect.arrayContaining(["search_providers", "book_appointment", "transfer_to_human"]));
    expect(update.session.instructions).toContain(browser.call.ref);
    model.send({ type: "session.updated" });

    // The agent speaks first.
    await model.waitFor((e) => e.type === "conversation.item.create" && JSON.stringify(e).includes("The call has connected"));
    model.say("Hello, this is Ada, an AI assistant on a demonstration line.");
    await browser.waitForEvent((e) => e.type === "audio");
    await browser.waitForEvent((e) => e.type === "transcript" && e.role === "agent");

    // Caller audio is relayed untouched.
    browser.ws.send(JSON.stringify({ type: "audio", data: "UENNMTY=" }));
    const appended = await model.waitFor((e) => e.type === "input_audio_buffer.append");
    expect(appended.audio).toBe("UENNMTY=");

    // Barge-in: the caller talks over the agent → browser is told to clear playback.
    model.send({ type: "input_audio_buffer.speech_started" });
    await browser.waitForEvent((e) => e.type === "clear");

    // Search.
    const date = weekdayAhead(9);
    browser.ws.send(JSON.stringify({ type: "text", text: "Fever since last night, I'm in Taksim. Tomorrow afternoon please." }));
    await model.waitFor((e) => e.type === "conversation.item.create" && JSON.stringify(e).includes("Taksim"));
    model.callFunction("search_providers", {
      location: "Taksim",
      specialty: "General Medicine",
      date,
      time_of_day: "afternoon",
      language: "English",
    });
    const searchOut = await model.waitFor((e) => e.item?.type === "function_call_output");
    const search = JSON.parse(searchOut.item.output);
    expect(search.options.length).toBeGreaterThan(0);
    await model.waitFor((e) => e.type === "response.create");
    const providersEvent = await browser.waitForEvent((e) => e.type === "providers");
    expect(providersEvent.options[0].doctor).toBeTruthy();

    // Booking without confirmation is refused.
    const pick = search.options[0];
    model.callFunction("book_appointment", {
      provider_id: pick.provider_id,
      date,
      time: pick.slots[0],
      patient_name: "Voice Test Traveller",
      reason: "fever",
      caller_confirmed: false,
    });
    const refused = JSON.parse((await model.waitFor((e) => e.item?.type === "function_call_output")).item.output);
    expect(refused.error).toMatch(/confirm/i);

    // Confirmed booking creates appointment + case atomically.
    model.callFunction("book_appointment", {
      provider_id: pick.provider_id,
      date,
      time: pick.slots[0],
      patient_name: "Voice Test Traveller",
      contact: "+44 7700 900123",
      reason: "fever",
      caller_confirmed: true,
    });
    const booked = JSON.parse((await model.waitFor((e) => e.item?.type === "function_call_output")).item.output);
    expect(booked.booked).toBe(true);
    expect(booked.appointment_ref).toMatch(/^APT-\d{4}-\d+$/);
    expect(booked.case_ref).toMatch(/^CASE-\d+$/);
    await browser.waitForEvent((e) => e.type === "booked" && e.case?.ref === booked.case_ref);

    // Caller hangs up → the call is closed out with a summary on the case timeline.
    model.say("You're booked. A case manager has your details. Goodbye!");
    await browser.waitForEvent((e) => e.type === "transcript" && /booked/.test(e.text));
    browser.ws.send(JSON.stringify({ type: "hangup" }));

    let call = await prisma.call.findUniqueOrThrow({ where: { id: browser.call.id } });
    for (let i = 0; i < 50 && !call.endedAt; i++) {
      await new Promise((r) => setTimeout(r, 100));
      call = await prisma.call.findUniqueOrThrow({ where: { id: browser.call.id } });
    }
    expect(call.status).toBe("COMPLETED");
    expect(call.summary).toBeTruthy();
    expect(call.outcome).toMatchObject({ appointmentRef: booked.appointment_ref, caseRef: booked.case_ref });

    const kase = await prisma.case.findUniqueOrThrow({
      where: { ref: booked.case_ref },
      include: { appointments: true, events: true, calls: true, conversations: true },
    });
    expect(kase.id).toBe(call.caseId);
    expect(kase.appointments).toHaveLength(1);
    expect(kase.appointments[0].source).toBe("VOICE");
    expect(kase.calls.map((c) => c.ref)).toContain(call.ref);
    expect(kase.events.map((e) => e.type)).toEqual(expect.arrayContaining(["NOTE", "APPOINTMENT", "CALL"]));
    const transcript = kase.conversations[0].messages as { role: string; text: string }[];
    expect(transcript.some((m) => m.role === "user" && m.text.includes("Taksim"))).toBe(true);
    expect(transcript.some((m) => m.role === "agent")).toBe(true);
  });

  it("books once when the model sends the same booking twice in one turn", async () => {
    const browser = await newBrowserCall();
    const model = await fake.nextConnection();
    await model.waitFor((e) => e.type === "session.update");
    model.send({ type: "session.updated" });

    const date = weekdayAhead(12);
    model.callFunction("search_providers", { location: "Taksim", specialty: "General Medicine", date });
    const search = JSON.parse((await model.waitFor((e) => e.item?.type === "function_call_output")).item.output);
    const pick = search.options[0];

    // Grok sometimes issues parallel identical function calls in one response.
    const booking = {
      provider_id: pick.provider_id,
      date,
      time: pick.slots[0],
      patient_name: "Parallel Booking Traveller",
      reason: "ear pain",
      caller_confirmed: true,
    };
    model.callFunctions([
      { name: "book_appointment", args: booking },
      { name: "book_appointment", args: booking },
    ]);
    const outputs: Record<string, any>[] = [];
    for (let i = 0; i < 2; i++) {
      outputs.push(JSON.parse((await model.waitFor((e) => e.item?.type === "function_call_output")).item.output));
    }
    expect(outputs.map((o) => o.booked)).toEqual([true, true]);
    expect(outputs[1].appointment_ref).toBe(outputs[0].appointment_ref);
    expect(outputs[1].case_ref).toBe(outputs[0].case_ref);
    // Both calls answered → the agent is asked to continue once.
    await model.waitFor((e) => e.type === "response.create");

    const kase = await prisma.case.findUniqueOrThrow({ where: { ref: outputs[0].case_ref }, include: { appointments: true } });
    expect(kase.appointments).toHaveLength(1);
    await browser.waitForEvent((e) => e.type === "booked");
    expect(browser.events.filter((e) => e.type === "booked")).toHaveLength(1);

    browser.ws.send(JSON.stringify({ type: "hangup" }));
    let call = await prisma.call.findUniqueOrThrow({ where: { id: browser.call.id } });
    for (let i = 0; i < 50 && !call.endedAt; i++) {
      await new Promise((r) => setTimeout(r, 100));
      call = await prisma.call.findUniqueOrThrow({ where: { id: browser.call.id } });
    }
    expect(call.caseId).toBe(kase.id);
  });
});
