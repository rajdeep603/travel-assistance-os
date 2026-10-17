import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { PrismaClient, type Prisma } from "@prisma/client";
import { createGateway } from "../../voice-gateway/gateway";
import { SESSION_COOKIE, authEnabled, signSession } from "@/lib/auth/session";
import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { nextRef } from "@/lib/refs";
import { askInThread, deleteThread, getThread, listThreads, saveVoiceTurns, voiceBrief } from "@/lib/services/assistant-history";
import { monitorBus, type MonitorEvent } from "@/lib/voice/monitor";
import { startFakeXai } from "../fakes/fake-xai";

// The internal assistant's history (typed and spoken, per operator) and its
// voice mode, run through the real gateway, bridge, tools and database with
// a scripted stand-in for the Grok Voice API.

const prisma = new PrismaClient();
const run = Date.now();
const me = authEnabled() ? `assistant-test-${run}@example.com` : "demo";
const someoneElse = `assistant-other-${run}@example.com`;
const threads: string[] = [];
const calls: string[] = [];

const saved = { XAI_API_KEY: process.env.XAI_API_KEY, GATEWAY_SECRET: process.env.GATEWAY_SECRET };
let fake: Awaited<ReturnType<typeof startFakeXai>>;
let gateway: ReturnType<typeof createGateway>;
let gatewayUrl: string;

beforeAll(async () => {
  // The session API needs voice configured; CI has no keys of its own.
  process.env.XAI_API_KEY ||= "test-xai-key";
  process.env.GATEWAY_SECRET ||= "test-gateway-secret-0123456789abcdef";
  fake = await startFakeXai();
  gateway = createGateway({ model: { url: fake.url, apiKey: "test-key", name: "grok-voice-3.0" }, log: () => {} });
  await new Promise<void>((resolve) => gateway.server.listen(0, () => resolve()));
  gatewayUrl = `ws://127.0.0.1:${(gateway.server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await gateway.close();
  await fake.close();
  const rows = await prisma.call.findMany({ where: { id: { in: calls } } });
  await prisma.call.deleteMany({ where: { id: { in: calls } } });
  await prisma.conversation.deleteMany({ where: { id: { in: rows.map((c) => c.conversationId!).filter(Boolean) } } });
  await prisma.assistantThread.deleteMany({ where: { OR: [{ id: { in: threads } }, { operator: { in: [someoneElse] } }] } });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await prisma.$disconnect();
});

const cookie = async () => (authEnabled() ? `${SESSION_COOKIE}=${await signSession(me, process.env.SESSION_SECRET!)}` : "");

describe("assistant history", () => {
  it("keeps a conversation, and answers a follow-up about the case it was on", async () => {
    const first = await askInThread({ operator: me, question: "What is the status of CASE-1024?" });
    threads.push(first.thread.id);
    expect(first.thread.title).toBe("What is the status of CASE-1024?");
    expect(first.messages.map((m) => [m.role, m.mode])).toEqual([
      ["user", "text"],
      ["assistant", "text"],
    ]);
    expect(first.messages[1].text).toMatch(/^CASE-1024 /);

    const followUp = await askInThread({ operator: me, question: "Who is it assigned to?", threadId: first.thread.id });
    expect(followUp.messages[1].text).toMatch(/^CASE-1024 /);
    expect(followUp.messages[1].sources).toEqual([{ title: "Case CASE-1024", source: "db/cases" }]);

    const thread = await getThread(first.thread.id, me);
    expect(thread.messages.map((m) => m.text)).toEqual([
      "What is the status of CASE-1024?",
      first.messages[1].text,
      "Who is it assigned to?",
      followUp.messages[1].text,
    ]);
    const listed = (await listThreads(me)).find((t) => t.id === first.thread.id);
    expect(listed).toMatchObject({ messages: 4, voice: false, title: "What is the status of CASE-1024?" });
  });

  it("is private to the operator who had it", async () => {
    const mine = await askInThread({ operator: me, question: "What is the status of CASE-1022?" });
    threads.push(mine.thread.id);
    await expect(getThread(mine.thread.id, someoneElse)).rejects.toMatchObject({ status: 404 });
    await expect(askInThread({ operator: someoneElse, question: "And its claim?", threadId: mine.thread.id })).rejects.toMatchObject({ status: 404 });
    await expect(deleteThread(mine.thread.id, someoneElse)).rejects.toMatchObject({ status: 404 });
    expect((await listThreads(someoneElse)).map((t) => t.id)).not.toContain(mine.thread.id);

    await deleteThread(mine.thread.id, me);
    expect(await prisma.assistantMessage.count({ where: { threadId: mine.thread.id } })).toBe(0);
  });

  it("saves what was said in voice mode in order, and titles a voice-first conversation", async () => {
    const thread = await prisma.assistantThread.create({ data: { operator: me, title: "New conversation" } });
    threads.push(thread.id);
    expect((await listThreads(me)).map((t) => t.id)).not.toContain(thread.id);
    const at = new Date().toISOString();
    const count = await saveVoiceTurns(thread.id, "CALL-T1", [
      { role: "agent", text: "Hi, what do you need?", at },
      { role: "user", text: "Find Lena Koch's guarantee", at },
      { role: "user", text: "  ", at },
      { role: "agent", text: "LOG-0902 is acknowledged.", at },
    ]);
    expect(count).toBe(3);
    const saved = await getThread(thread.id, me);
    expect(saved.title).toBe("Find Lena Koch's guarantee");
    expect(saved.messages.map((m) => [m.role, m.mode, m.text, m.callRef])).toEqual([
      ["assistant", "voice", "Hi, what do you need?", "CALL-T1"],
      ["user", "voice", "Find Lena Koch's guarantee", "CALL-T1"],
      ["assistant", "voice", "LOG-0902 is acknowledged.", "CALL-T1"],
    ]);
    expect((await listThreads(me)).find((t) => t.id === thread.id)).toMatchObject({ voice: true, messages: 3 });
  });
});

describe("assistant voice mode", () => {
  it("starts in a new conversation, or joins one with its earlier turns", async () => {
    const { POST } = await import("@/app/api/voice/session/route");
    const post = async (body: unknown) =>
      POST(new Request("http://app/api/voice/session", { method: "POST", headers: { cookie: await cookie() }, body: JSON.stringify(body) }), {});

    const fresh = await post({ profile: "internal-assistant" });
    expect(fresh.status).toBe(201);
    const started = await fresh.json();
    calls.push(started.call.id);
    threads.push(started.thread.id);
    const call = await prisma.call.findUniqueOrThrow({ where: { id: started.call.id } });
    expect(call).toMatchObject({ agentProfile: "internal-assistant", channel: "BROWSER", caseId: null });
    expect(call.outcome).toEqual({ assistantThreadId: started.thread.id, brief: { earlier_in_this_conversation: [] } });

    const typed = await askInThread({ operator: me, question: "What is the status of CASE-1022?" });
    threads.push(typed.thread.id);
    const joined = await (await post({ profile: "internal-assistant", threadId: typed.thread.id })).json();
    calls.push(joined.call.id);
    expect(joined.thread.id).toBe(typed.thread.id);
    expect((await prisma.call.findUniqueOrThrow({ where: { id: joined.call.id } })).outcome).toMatchObject({
      brief: { earlier_in_this_conversation: [{ who: "operator", said: "What is the status of CASE-1022?" }, { who: "assistant" }] },
    });

    const theirs = await prisma.assistantThread.create({ data: { operator: someoneElse, title: "Theirs" } });
    expect((await post({ profile: "internal-assistant", threadId: theirs.id })).status).toBe(404);
  });

  it("answers out loud, opens the record on screen and saves the talk into the conversation, off the Call Center", async () => {
    const typed = await askInThread({ operator: me, question: "What is the status of CASE-1022?" });
    threads.push(typed.thread.id);
    const kase = await prisma.case.findUniqueOrThrow({ where: { ref: "CASE-1022" } });
    const call = await prisma.call.create({
      data: {
        ref: await nextRef("call"),
        direction: "INBOUND",
        channel: "BROWSER",
        agentProfile: "internal-assistant",
        placedBy: me,
        outcome: { assistantThreadId: typed.thread.id, brief: (await voiceBrief(typed.thread.id, me)) as Prisma.InputJsonObject },
      },
    });
    calls.push(call.id);

    const monitored: MonitorEvent[] = [];
    const unsubscribe = monitorBus.subscribe((e) => monitored.push(e));
    const ticket = await signToken({ kind: "browser-voice", callId: call.id, profile: "internal-assistant" }, gatewaySecret(), 60);
    const events: Record<string, any>[] = [];
    const ws = new WebSocket(`${gatewayUrl}/ws/voice?ticket=${encodeURIComponent(ticket)}`);
    ws.on("message", (raw) => events.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    const waitForEvent = async (match: (e: Record<string, any>) => boolean) => {
      for (let i = 0; i < 250; i++) {
        const hit = events.find(match);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`browser: timed out; got ${events.map((e) => e.type).join(", ")}`);
    };

    const model = await fake.nextConnection();
    const update = await model.waitFor((e) => e.type === "session.update");
    expect(update.session.tools.map((t: { name: string }) => t.name)).toEqual([
      "search_knowledge",
      "lookup_case",
      "search_records",
      "find_providers",
      "open_record",
      "end_call",
    ]);
    expect(update.session.instructions).toContain("Operator: What is the status of CASE-1022?");
    model.send({ type: "session.updated" });
    await model.waitFor((e) => e.type === "conversation.item.create" && JSON.stringify(e).includes("switched on voice mode"));
    model.say("Hi! Shall we carry on with case ten twenty-two?");
    await waitForEvent((e) => e.type === "transcript" && e.role === "agent");

    ws.send(JSON.stringify({ type: "text", text: "Yes, open it and tell me the money." }));
    await model.waitFor((e) => e.type === "conversation.item.create" && JSON.stringify(e).includes("open it"));
    model.callFunction("open_record", { target: "case 1022" });
    const opened = JSON.parse((await model.waitFor((e) => e.item?.type === "function_call_output")).item.output);
    expect(opened).toMatchObject({ opened: true, showing: expect.stringContaining("CASE-1022") });
    expect(await waitForEvent((e) => e.type === "navigate")).toMatchObject({ href: `/cases/${kase.id}`, label: "CASE-1022" });

    model.callFunction("lookup_case", { case_ref: "CASE-1022" });
    const looked = JSON.parse((await model.waitFor((e) => e.item?.type === "function_call_output" && e.item.output.includes("case_ref"))).item.output);
    expect(looked).toMatchObject({ found: true, case_ref: "CASE-1022", patient: expect.stringContaining("Lena Koch") });
    expect(looked.money).toMatchObject({ guaranteed: expect.stringMatching(/EUR$/) });
    // Looking a case up doesn't file the session on it.
    expect((await prisma.call.findUniqueOrThrow({ where: { id: call.id } })).caseId).toBeNull();

    model.say("It's open on your screen. Eleven thousand eight hundred and fifty euros is guaranteed.");
    await waitForEvent((e) => e.type === "transcript" && /open on your screen/.test(e.text));
    ws.send(JSON.stringify({ type: "hangup" }));
    await new Promise<void>((resolve) => (ws.readyState === WebSocket.CLOSED ? resolve() : ws.once("close", () => resolve())));

    // Saved before the browser hears the session ended.
    const thread = await getThread(typed.thread.id, me);
    expect(thread.messages.slice(2).map((m) => [m.role, m.mode, m.callRef])).toEqual([
      ["assistant", "voice", call.ref],
      ["user", "voice", call.ref],
      ["assistant", "voice", call.ref],
    ]);
    expect(thread.messages[3].text).toBe("Yes, open it and tell me the money.");

    let ended = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    for (let i = 0; i < 50 && !ended.endedAt; i++) {
      await new Promise((r) => setTimeout(r, 100));
      ended = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    }
    unsubscribe();
    expect(ended).toMatchObject({ status: "COMPLETED", summary: null, caseId: null });
    expect(monitored.filter((e) => e.callId === call.id)).toEqual([]);

    const { GET } = await import("@/app/api/calls/route");
    const listed = (await (await GET(new Request("http://app/api/calls"), {})).json()) as { calls: { id: string }[] };
    expect(listed.calls.map((c) => c.id)).not.toContain(call.id);
  });
});
