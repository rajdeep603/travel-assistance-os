import type { AssistantMessage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { askAssistant } from "./assistant";
import type { AssistantTurn, ChatMessage } from "./types";

// ---------------------------------------------------------------------------
// The internal assistant's conversations, kept per operator: typed questions
// and answers, and what was said in voice mode (saved when the voice session
// ends). The recent turns go back to the assistant, so follow-ups work, and
// to the voice agent when voice is switched on mid-conversation.
// ---------------------------------------------------------------------------

/** Title of a conversation that has no question yet. */
export const NEW_TITLE = "New conversation";
/** Earlier turns the assistant sees. */
const HISTORY_TURNS = 10;

export interface AssistantMessageDto {
  id: string;
  role: "user" | "assistant";
  mode: "text" | "voice";
  text: string;
  sources: { title: string; source: string }[];
  aiSource: string | null;
  callRef: string | null;
  createdAt: string;
}

export interface AssistantThreadSummary {
  id: string;
  title: string;
  updatedAt: string;
  messages: number;
  /** Something in it was said in voice mode. */
  voice: boolean;
  preview: string;
}

export function toDto(m: AssistantMessage): AssistantMessageDto {
  return {
    id: m.id,
    role: m.role === "USER" ? "user" : "assistant",
    mode: m.mode === "VOICE" ? "voice" : "text",
    text: m.text,
    sources: Array.isArray(m.sources) ? (m.sources as unknown as AssistantMessageDto["sources"]) : [],
    aiSource: m.aiSource,
    callRef: m.callRef,
    createdAt: m.createdAt.toISOString(),
  };
}

const toTurn = (m: Pick<AssistantMessage, "role" | "text">): AssistantTurn => ({ role: m.role === "USER" ? "user" : "assistant", text: m.text });

/** A conversation's title from its first question: one line, cut at a word. */
export function threadTitle(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean || NEW_TITLE;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${space > max / 2 ? cut.slice(0, space) : cut}…`;
}

async function ownThread(id: string, operator: string) {
  const thread = await prisma.assistantThread.findFirst({ where: { id, operator } });
  if (!thread) throw notFound("Conversation");
  return thread;
}

/** The operator's conversations with at least one message, latest first. */
export async function listThreads(operator: string, take = 40): Promise<AssistantThreadSummary[]> {
  const threads = await prisma.assistantThread.findMany({
    where: { operator, messages: { some: {} } },
    orderBy: { updatedAt: "desc" },
    take,
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true } },
    },
  });
  const spoken = await prisma.assistantMessage.groupBy({
    by: ["threadId"],
    where: { threadId: { in: threads.map((t) => t.id) }, mode: "VOICE" },
    _count: true,
  });
  const voice = new Set(spoken.map((s) => s.threadId));
  return threads.map((t) => ({
    id: t.id,
    title: t.title,
    updatedAt: t.updatedAt.toISOString(),
    messages: t._count.messages,
    voice: voice.has(t.id),
    preview: (t.messages[0]?.text ?? "").replace(/\s+/g, " ").slice(0, 120),
  }));
}

export async function getThread(id: string, operator: string) {
  const thread = await ownThread(id, operator);
  const messages = await prisma.assistantMessage.findMany({ where: { threadId: id }, orderBy: { createdAt: "asc" } });
  return { id: thread.id, title: thread.title, updatedAt: thread.updatedAt.toISOString(), messages: messages.map(toDto) };
}

export async function createThread(operator: string) {
  const thread = await prisma.assistantThread.create({ data: { operator, title: NEW_TITLE } });
  return { id: thread.id, title: thread.title, updatedAt: thread.updatedAt.toISOString(), messages: [] as AssistantMessageDto[] };
}

export async function deleteThread(id: string, operator: string): Promise<void> {
  const { count } = await prisma.assistantThread.deleteMany({ where: { id, operator } });
  if (!count) throw notFound("Conversation");
}

/** Asks the assistant in a conversation (a new one without `threadId`) and keeps both turns. */
export async function askInThread(input: { operator: string; question: string; threadId?: string | null }) {
  const thread = input.threadId
    ? await ownThread(input.threadId, input.operator)
    : await prisma.assistantThread.create({ data: { operator: input.operator, title: threadTitle(input.question) } });
  const askedAt = new Date();
  const earlier = await prisma.assistantMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TURNS,
    select: { role: true, text: true },
  });
  const answer = await askAssistant(input.question, earlier.reverse().map(toTurn));
  const answeredAt = new Date(Math.max(Date.now(), askedAt.getTime() + 1));
  const title = thread.title === NEW_TITLE ? threadTitle(input.question) : thread.title;

  const [question, reply] = await prisma.$transaction([
    prisma.assistantMessage.create({ data: { threadId: thread.id, role: "USER", text: input.question, createdAt: askedAt } }),
    prisma.assistantMessage.create({
      data: {
        threadId: thread.id,
        role: "ASSISTANT",
        text: answer.answer,
        sources: answer.sources as unknown as Prisma.InputJsonValue,
        aiSource: answer.aiSource ?? null,
        createdAt: answeredAt,
      },
    }),
    prisma.assistantThread.update({ where: { id: thread.id }, data: { title, updatedAt: answeredAt } }),
  ]);
  return { thread: { id: thread.id, title }, messages: [toDto(question), toDto(reply)] };
}

/** What the voice agent should know of the conversation it joins. */
export async function voiceBrief(threadId: string, operator: string): Promise<Record<string, unknown>> {
  await ownThread(threadId, operator);
  const earlier = await prisma.assistantMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { role: true, text: true },
  });
  return {
    earlier_in_this_conversation: earlier.reverse().map((m) => ({
      who: m.role === "USER" ? "operator" : "assistant",
      said: m.text.length > 600 ? `${m.text.slice(0, 600)}…` : m.text,
    })),
  };
}

/** Adds what was said in a voice session to its conversation. */
export async function saveVoiceTurns(threadId: string, callRef: string, messages: ChatMessage[]): Promise<number> {
  const turns = messages.filter((m) => m.text.trim());
  if (!turns.length) return 0;
  const thread = await prisma.assistantThread.findUnique({ where: { id: threadId }, select: { title: true } });
  if (!thread) return 0;
  // Keep the spoken order even when two lines share a millisecond.
  let last = 0;
  const data = turns.map((m) => {
    let at = Date.parse(m.at) || Date.now();
    if (at <= last) at = last + 1;
    last = at;
    return { threadId, role: m.role === "user" ? ("USER" as const) : ("ASSISTANT" as const), mode: "VOICE" as const, text: m.text.trim(), callRef, createdAt: new Date(at) };
  });
  const firstQuestion = turns.find((m) => m.role === "user");
  await prisma.$transaction([
    prisma.assistantMessage.createMany({ data }),
    prisma.assistantThread.update({
      where: { id: threadId },
      data: {
        updatedAt: new Date(Math.max(Date.now(), last)),
        ...(thread.title === NEW_TITLE && firstQuestion ? { title: threadTitle(firstQuestion.text) } : {}),
      },
    }),
  ]);
  return data.length;
}
