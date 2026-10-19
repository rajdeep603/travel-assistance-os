import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { runAI } from "@/lib/services/ai";
import { ISTANBUL_DISTRICTS } from "@/lib/services/nlu";
import type { ChatMessage, ConversationSummaryContext } from "@/lib/services/types";
import { utcToZoned, weekdayIndex } from "@/lib/time";
import type { AgentContext, AgentProfile } from "./agents/types";
import type { VoiceLeg } from "./legs/types";
import { voiceLanguage } from "./languages";
import { monitorBus } from "./monitor";
import { XaiRealtimeSession } from "./realtime/xai-session";
import { executeTool, realtimeTools } from "./tools/registry";
import type { ToolContext } from "./tools/types";

// ---------------------------------------------------------------------------
// A live voice session: joins a caller leg (browser or phone) to a Grok Voice
// session running an agent profile. Relays audio both ways, handles barge-in,
// runs tool calls against the platform's services, persists the transcript,
// streams everything to the live monitor, and closes the books at the end
// (status, duration, AI summary, case timeline).
// ---------------------------------------------------------------------------

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Handles on running sessions, for events that arrive out of band (AMD). */
export interface LiveSessionHandle {
  answeredBy(result: string): void;
}
export const liveSessions = new Map<string, LiveSessionHandle>();

/** Phone-only actions, provided by the telephony layer. */
export interface CallControls {
  transfer(target: "doctor" | "case_manager", summary: string): Promise<{ ok: boolean; message: string }>;
  /** The AI can't carry on: apologise on the line, then a case manager if one can be dialled, else hang up. */
  fallback(): Promise<{ transferredTo: "case_manager" | null }>;
  hangup(): Promise<void>;
}

export interface VoiceSessionParams {
  leg: VoiceLeg;
  profile: AgentProfile;
  /** Existing Call row for this session. */
  callId: string;
  controls?: CallControls;
  brief?: Record<string, unknown> | null;
  /** Test/override hooks for the model connection. */
  model?: { url?: string; apiKey?: string; name?: string };
}

function agentContext(
  callRef: string,
  channel: "PHONE" | "BROWSER",
  linkedCase: AgentContext["linkedCase"],
  brief: Record<string, unknown> | null | undefined,
  language: string | null
): AgentContext {
  const now = utcToZoned(new Date());
  return {
    callRef,
    channel,
    today: now.date,
    weekday: WEEKDAYS[weekdayIndex(now.date)],
    time: now.time,
    linkedCase,
    brief: brief ?? null,
    language,
  };
}

/** Silence after the agent finished speaking before it checks on a phone caller. */
const PHONE_IDLE_MS = 12_000;

/** Tools after which the agent must not speak again (the call is over or handed on). */
const FINAL_TOOLS = new Set(["end_call"]);

const DEFAULT_KEYTERMS = [
  ...Object.keys(ISTANBUL_DISTRICTS).map((d) => d.charAt(0).toUpperCase() + d.slice(1)),
  "Istanbul",
  "CASE",
  "CLM",
];

/** Runs one voice session; resolves once it has ended and its call record is saved. */
export async function runVoiceSession(params: VoiceSessionParams): Promise<void> {
  const { leg, profile } = params;
  const call = await prisma.call.findUniqueOrThrow({
    where: { id: params.callId },
    include: { case: { include: { patient: true } } },
  });
  const channel = call.channel;
  const startedAt = Date.now();
  // Browser rehearsals of outbound agents carry their brief on the call, like phone calls do.
  const brief = params.brief ?? (call.outcome as { brief?: Record<string, unknown> } | null)?.brief ?? null;
  const language = voiceLanguage(call.language);

  const conversation = await prisma.conversation.create({
    data: {
      channel: channel === "PHONE" ? "PHONE" : "VOICE",
      messages: [],
      caseId: call.caseId,
      call: { connect: { id: call.id } },
    },
  });

  // Resolves once the session has ended and its record is saved, so the
  // gateway can wait for live calls before it shuts down.
  let sessionEnded: () => void = () => {};
  const finished = new Promise<void>((resolve) => (sessionEnded = resolve));

  const messages: ChatMessage[] = [];
  let outcome: Record<string, unknown> = (call.outcome as Record<string, unknown> | null) ?? {};
  let status: "COMPLETED" | "TRANSFERRED" | "FAILED" | "VOICEMAIL" = "COMPLETED";
  let transferredTo: string | null = null;
  /** Why the voice model failed the call, when it did; outlives a racing hang-up. */
  let failure: string | null = null;
  let handover: Promise<void> | null = null;
  let ended = false;
  let flushTimer: NodeJS.Timeout | null = null;
  const timers: NodeJS.Timeout[] = [];

  const flush = async () => {
    flushTimer = null;
    await prisma.conversation
      .update({ where: { id: conversation.id }, data: { messages: messages as unknown as Prisma.InputJsonValue } })
      .catch((err) => console.error(`[voice] ${call.ref} transcript save failed:`, err));
  };
  const scheduleFlush = () => {
    if (!flushTimer) flushTimer = setTimeout(flush, 1500);
  };

  // The live Call Center board shows calls, not colleagues talking to the internal assistant.
  const publish = (event: Record<string, unknown>) => {
    if (!profile.internal) monitorBus.publish({ callId: call.id, callRef: call.ref, type: String(event.type), ...event });
  };

  const emit = (event: Record<string, unknown>) => {
    leg.sendEvent(event);
    publish(event);
  };

  const record = (role: ChatMessage["role"], text: string) => {
    messages.push({ role, text, at: new Date().toISOString() });
    scheduleFlush();
    emit({ type: "transcript", role, text });
  };

  // The caller's utterances grow and get corrected while they speak: one
  // message per utterance, updated in place; `line` lets UIs do the same.
  const callerLines = new Map<string, ChatMessage>();
  const recordCaller = (text: string, line: string) => {
    let message = callerLines.get(line);
    if (message) message.text = text;
    else {
      message = { role: "user", text, at: new Date().toISOString() };
      callerLines.set(line, message);
      messages.push(message);
    }
    scheduleFlush();
    emit({ type: "transcript", role: "user", text, line });
  };

  const ctx: ToolContext = {
    callId: call.id,
    callRef: call.ref,
    conversationId: conversation.id,
    profileId: profile.id,
    channel,
    caseId: call.caseId,
    patientId: call.case?.patientId ?? null,
    async setCase(caseId, patientId) {
      if (ctx.caseId === caseId) return;
      ctx.caseId = caseId;
      ctx.patientId = patientId;
      const [updated] = await prisma.$transaction([
        prisma.call.update({ where: { id: call.id }, data: { caseId }, select: { case: { select: { id: true, ref: true } } } }),
        prisma.conversation.update({ where: { id: conversation.id }, data: { caseId } }),
      ]);
      if (updated.case) emit({ type: "case", case: updated.case });
    },
    async setOutcome(patch) {
      outcome = { ...outcome, ...patch };
      await prisma.call
        .update({ where: { id: call.id }, data: { outcome: outcome as Prisma.InputJsonValue } })
        .catch((err) => console.error(`[voice] ${call.ref} outcome save failed:`, err));
    },
    emit,
    actions: {
      async hangup(reason) {
        await leg.awaitPlayback(8000);
        await params.controls?.hangup().catch(() => undefined);
        await end(reason);
      },
      async transfer(target, summary) {
        if (!params.controls) {
          return {
            ok: false,
            message:
              "Live transfer isn't available in this web session. Tell the caller a case manager has their details and will call them back right away.",
          };
        }
        await leg.awaitPlayback(8000);
        // Twilio may close the media stream before the API call returns, so
        // record the transfer first and undo it if it fails.
        status = "TRANSFERRED";
        transferredTo = target;
        const result = await params.controls.transfer(target, summary);
        if (!result.ok) {
          status = "COMPLETED";
          transferredTo = null;
        }
        return result;
      },
    },
  };

  const session = new XaiRealtimeSession({
    apiKey: params.model?.apiKey ?? env.xaiApiKey,
    model: params.model?.name ?? env.xaiVoiceModel,
    url: params.model?.url ?? env.xaiRealtimeUrl,
    config: {
      instructions: profile.instructions(
        agentContext(
          call.ref,
          channel,
          call.case
            ? {
                ref: call.case.ref,
                title: call.case.title,
                patientName: `${call.case.patient.firstName} ${call.case.patient.lastName}`,
                location: call.case.location,
                status: call.case.status,
              }
            : null,
          brief,
          language?.name ?? null
        )
      ),
      voice: profile.voice,
      input: leg.format,
      output: leg.format,
      tools: realtimeTools(profile.tools),
      languageHint: language ? (language.hint === undefined ? language.code : language.hint ?? undefined) : profile.languageHint,
      keyterms: [...DEFAULT_KEYTERMS, ...(profile.keyterms ?? []), ...(call.case ? [call.case.ref] : [])],
      reasoningEffort: profile.reasoningEffort,
    },
  });

  // Re-engage a silent phone caller. Counted from when the agent's audio has
  // finished playing: the model's own idle timer counts from when it finished
  // generating, so it fired halfway through long answers and the agent
  // repeated their tail.
  let idleSeq = 0;
  let idleTimer: NodeJS.Timeout | null = null;
  let idleNudges = 0;
  const disarmIdle = () => {
    idleSeq += 1;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };
  const armIdle = () => {
    if (channel !== "PHONE" || ended) return;
    disarmIdle();
    const seq = idleSeq;
    void leg.awaitPlayback(90_000).then(() => {
      if (seq !== idleSeq || ended) return;
      idleTimer = setTimeout(() => {
        if (seq !== idleSeq || ended) return;
        idleNudges += 1;
        session.sendText(
          idleNudges > 2
            ? "[The caller has been silent for a long time. Say a short goodbye and end the call.]"
            : "[The caller hasn't said anything for a while. Briefly check whether they're still there; don't repeat what you already said.]"
        );
      }, PHONE_IDLE_MS);
    });
  };

  /** What the summary should know beyond the transcript; the case may be new since the call started. */
  async function summaryContext(finalOutcome: Record<string, unknown>): Promise<ConversationSummaryContext> {
    const kase = ctx.caseId
      ? await prisma.case.findUnique({ where: { id: ctx.caseId }, include: { patient: true } }).catch(() => null)
      : null;
    return {
      outcome: finalOutcome,
      status,
      agentId: profile.id,
      agentLabel: profile.label,
      channel,
      direction: profile.direction,
      audience: profile.audience ?? null,
      language: profile.languageHint ?? null,
      caseRef: kase?.ref ?? null,
      patientName: kase ? `${kase.patient.firstName} ${kase.patient.lastName}` : null,
      location: kase?.location ?? null,
    };
  }

  /**
   * Phone callers can't see an error event: when the voice model can't be
   * reached or drops mid-call, the live call is redirected to people instead
   * of going silent. Runs once; end() waits for it, because Twilio closes the
   * media stream as soon as the call moves on.
   */
  function handOver(reason: string): Promise<void> {
    handover ??= (async () => {
      failure = reason;
      status = "FAILED";
      if (!params.controls) return;
      const result = await params.controls.fallback().catch((err) => {
        console.error(`[voice] ${call.ref} fallback redirect failed:`, err instanceof Error ? err.message : err);
        return null;
      });
      if (result?.transferredTo) {
        status = "TRANSFERRED";
        transferredTo = result.transferredTo;
        // Read by the whisper when the case manager picks up.
        await ctx.setOutcome({
          handoff: {
            target: result.transferredTo,
            reason: "AI assistant unavailable",
            summary: "The AI assistant could not take this call, so the caller has not been triaged yet.",
          },
        });
      }
    })();
    return handover;
  }

  async function end(reason: string): Promise<void> {
    if (ended) return;
    ended = true;
    try {
      await finish(reason);
    } finally {
      sessionEnded();
    }
  }

  async function finish(reason: string): Promise<void> {
    // Closing the leg before a redirect lands would hang up on the caller.
    if (handover) await handover;
    reason = failure ?? reason;
    liveSessions.delete(call.id);
    disarmIdle();
    for (const t of timers) clearTimeout(t);
    session.close();
    // Before the browser hears the session has ended, so what it reloads includes it.
    if (profile.afterSession) {
      await profile
        .afterSession({ callRef: call.ref, outcome, messages })
        .catch((err) => console.error(`[voice] ${call.ref} after-session step failed:`, err));
    }
    leg.close(reason);
    if (flushTimer) clearTimeout(flushTimer);
    await flush();

    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    let summary: string | null = null;
    if (messages.length > 0 && !profile.internal) {
      const context = await summaryContext({ ...outcome, endReason: reason });
      summary = await Promise.race([
        runAI("summarizeConversation", (ai) => ai.summarizeConversation(messages, context)).then((r) => r.value),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000)),
      ]).catch(() => null);
    }

    await prisma.$transaction([
      prisma.conversation.update({ where: { id: conversation.id }, data: { summary } }),
      prisma.call.update({
        where: { id: call.id },
        data: {
          status,
          endedAt: new Date(),
          durationSec,
          summary,
          transferredTo,
          outcome: { ...outcome, endReason: reason } as Prisma.InputJsonValue,
        },
      }),
      ...(ctx.caseId
        ? [
            prisma.caseEvent.create({
              data: {
                caseId: ctx.caseId,
                type: "CALL",
                title: `${channel === "PHONE" ? "Phone call" : "Voice session"} ${call.ref} — ${profile.label}`,
                body: summary ?? `${messages.length} messages, ${durationSec}s.`,
                data: { callRef: call.ref, durationSec, status, outcome } as Prisma.InputJsonValue,
                actor: `agent:${profile.id}`,
              },
            }),
          ]
        : []),
    ]).catch((err) => console.error(`[voice] ${call.ref} finalisation failed:`, err));

    publish({ type: "call_ended", status, durationSec, summary, reason });
  }

  // --- Connect to the model -------------------------------------------------
  try {
    await session.connect();
  } catch (err) {
    console.error(`[voice] ${call.ref} could not reach the voice model:`, err instanceof Error ? err.message : err);
    status = "FAILED";
    if (channel === "PHONE" && params.controls) await handOver("voice model unavailable");
    else leg.sendEvent({ type: "error", message: "The voice service is unavailable right now. Please try again shortly." });
    await end("voice model unavailable");
    return finished;
  }

  await prisma.call.update({ where: { id: call.id }, data: { status: "IN_PROGRESS", answeredAt: new Date() } });
  if (!profile.internal) monitorBus.started({
    callId: call.id,
    callRef: call.ref,
    profileId: profile.id,
    profileLabel: profile.label,
    channel,
    direction: profile.direction,
    startedAt: new Date(startedAt).toISOString(),
    caller: call.direction === "INBOUND" ? call.fromNumber : call.toNumber,
    caseRef: call.case?.ref ?? null,
    transcript: [],
    tools: [],
  });
  leg.sendEvent({ type: "ready", callRef: call.ref, agent: profile.label });
  liveSessions.set(call.id, {
    answeredBy(result) {
      if (!result.startsWith("machine")) return;
      status = "VOICEMAIL";
      outcome = { ...outcome, answeredBy: result };
      session.sendText(
        "[An answering machine picked up and the greeting has finished. Leave one short voicemail now: who you are, why you called, that you'll try again or they can call the assistance line. Then call end_call.]"
      );
    },
  });

  // --- Wire audio, transcripts and tools ---------------------------------------
  leg.onAudio((b64) => session.appendAudio(b64));
  leg.onText((text) => {
    disarmIdle();
    idleNudges = 0;
    record("user", text);
    session.sendText(text);
  });

  let digits = "";
  let digitTimer: NodeJS.Timeout | null = null;
  leg.onDtmf((digit) => {
    digits += digit;
    if (digitTimer) clearTimeout(digitTimer);
    digitTimer = setTimeout(() => {
      session.sendText(`[The caller typed on the keypad: ${digits}]`);
      digits = "";
    }, 2500);
  });
  leg.onClose((reason) => void end(reason));

  session.on("audio", (b64) => leg.sendAudio(b64));
  session.on("speech_started", () => {
    disarmIdle();
    idleNudges = 0;
    leg.clearPlayback();
    emit({ type: "user_speaking" });
  });
  session.on("response_started", disarmIdle);
  session.on("response_done", armIdle);
  // The caller has finished: the model is working out its answer.
  session.on("speech_stopped", () => emit({ type: "agent_thinking" }));
  session.on("agent_transcript_delta", (text) => emit({ type: "transcript_delta", role: "agent", text }));
  session.on("agent_transcript_done", (text) => record("agent", text));
  session.on("user_transcript", recordCaller);
  // The model can get stuck re-sending a call that failed; a third identical
  // attempt isn't run, and it is told to ask the caller instead.
  const attempts = new Map<string, number>();
  session.on("function_call", async ({ callId, name, args }) => {
    emit({ type: "tool", name, status: "running" });
    const key = `${name}:${JSON.stringify(args)}`;
    const tries = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, tries);
    const result =
      tries > 2 && !FINAL_TOOLS.has(name)
        ? { error: "You already made this exact call twice. Don't repeat it: ask the caller for the missing or corrected details, or offer a case manager call-back." }
        : await executeTool(name, args, ctx, profile.tools);
    const failed = typeof result.error === "string";
    emit({ type: "tool", name, status: failed ? "error" : "done", summary: failed ? result.error : undefined });
    session.sendFunctionResult(callId, result, { respond: failed || !FINAL_TOOLS.has(name) });
  });
  session.on("error", (err) => console.warn(`[voice] ${call.ref} model error:`, err.message));
  session.on("closed", () => {
    // Unexpected while the caller is still on the line (end() closes it too);
    // a transfer or voicemail in progress already decides what happens next.
    if (!ended && channel === "PHONE" && params.controls && status === "COMPLETED") {
      console.warn(`[voice] ${call.ref} lost the voice model mid-call; handing the caller over`);
      void handOver("voice model disconnected").then(() => end("voice model disconnected"));
      return;
    }
    void end("voice model disconnected");
  });

  // --- Session limits and the opening line -------------------------------------
  const max = profile.maxSeconds * 1000;
  timers.push(
    setTimeout(() => session.sendText("[Time is nearly up. Wrap up politely within twenty seconds.]"), Math.max(0, max - 30_000)),
    setTimeout(() => void ctx.actions.hangup("maximum call length reached"), max)
  );
  session.sendText(profile.openingCue);
  return finished;
}
