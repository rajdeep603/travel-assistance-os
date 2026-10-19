// ---------------------------------------------------------------------------
// Runs one voice agent end to end against the real Grok Voice API, the local
// database and the real tools, with a scripted caller instead of a person:
//
//   npx tsx scripts/voice-probe.ts --agent inbound-hotline --channel PHONE \
//     --lang es --say "Hola, soy James Carter…" --say "…"
//
// Each --say is one caller turn, spoken with a macOS voice (say + afconvert),
// streamed in real time like a phone or browser would. --text sends typed
// turns instead. The fake leg plays the agent's audio in real time, so
// barge-in, idle timers and playback waits behave as on a real call.
// Options: --hold 40000 (stay silent after the last turn), --case CASE-1024 (outbound agents and case-linked sessions),
// --language "Spanish" (the session's opening language), --debug (model
// events), --save agent.wav (the agent's audio, to listen to). Prints the
// transcript, what the recogniser heard the caller say, tool activity and the
// call's outcome.
// Needs XAI_API_KEY and macOS; development only.
// ---------------------------------------------------------------------------

import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { nextRef } from "@/lib/refs";
import { getAgent } from "@/lib/voice/agents/registry";
import { runVoiceSession, type CallControls } from "@/lib/voice/bridge";
import type { VoiceLeg } from "@/lib/voice/legs/types";
import type { AudioFormat } from "@/lib/voice/realtime/xai-session";

const VOICES: Record<string, string> = {
  en: "Samantha", tr: "Yelda", es: "Mónica", ar: "Majed", de: "Anna", it: "Alice", sv: "Alva", nb: "Nora", no: "Nora",
  hi: "Lekha", ru: "Milena", fr: "Thomas", pl: "Zosia", cs: "Zuzana", pt: "Luciana",
  zh: "Tingting", yue: "Sinji", ja: "Kyoko", th: "Kanya", ms: "Amira", id: "Damayanti",
};

function args() {
  const a = process.argv.slice(2);
  const out = { agent: "inbound-hotline", channel: "PHONE" as "PHONE" | "BROWSER", lang: "en", language: "", caseRef: "", turns: [] as { text: string; typed: boolean }[], debug: false, gapMs: 1200, holdMs: 0, save: "" };
  for (let i = 0; i < a.length; i++) {
    const v = a[i + 1];
    switch (a[i]) {
      case "--agent": out.agent = v; i++; break;
      case "--channel": out.channel = v.toUpperCase() as "PHONE" | "BROWSER"; i++; break;
      case "--lang": out.lang = v; i++; break;
      case "--language": out.language = v; i++; break;
      case "--case": out.caseRef = v; i++; break;
      case "--say": out.turns.push({ text: v, typed: false }); i++; break;
      case "--text": out.turns.push({ text: v, typed: true }); i++; break;
      case "--gap": out.gapMs = Number(v); i++; break;
      case "--hold": out.holdMs = Number(v); i++; break;
      case "--debug": out.debug = true; break;
      case "--save": out.save = v; i++; break;
    }
  }
  return out;
}

const opts = args();
if (opts.debug) process.env.VOICE_DEBUG = "1";
const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`;
const log = (...parts: unknown[]) => console.log(stamp(), ...parts);

/** Caller speech as raw frames in the leg's format. */
function speech(text: string, phone: boolean): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), "probe-"));
  const aiff = path.join(dir, "turn.aiff");
  const wav = path.join(dir, "turn.wav");
  execFileSync("say", ["-v", VOICES[opts.lang] ?? "Samantha", "-o", aiff, text]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", phone ? "ulaw@8000" : "LEI16@24000", "-c", "1", aiff, wav]);
  const buf = readFileSync(wav);
  const data = buf.indexOf("data");
  return buf.subarray(data + 8);
}

class ProbeLeg implements VoiceLeg {
  readonly kind: "browser" | "twilio";
  readonly format: AudioFormat;
  private audio: ((b64: string) => void)[] = [];
  private text: ((t: string) => void)[] = [];
  private closers: ((reason: string) => void)[] = [];
  /** Wall-clock time the agent's queued audio finishes playing. */
  playUntil = 0;
  lastAgentAudio = 0;
  closed = false;
  /** The agent's audio as sent, for --save. */
  agentAudio: Buffer[] = [];
  /** What the recogniser heard, per caller utterance (it grows while they speak). */
  heard = new Map<string, string>();
  private bytesPerMs: number;
  private silence: NodeJS.Timeout;

  constructor(readonly phone: boolean) {
    this.kind = phone ? "twilio" : "browser";
    this.format = phone ? { type: "audio/pcmu" } : { type: "audio/pcm", rate: 24_000 };
    this.bytesPerMs = phone ? 8 : 48;
    // A phone line never goes quiet: send silence whenever the caller isn't talking.
    this.silence = setInterval(() => {
      if (!this.talking) this.push(Buffer.alloc(20 * this.bytesPerMs, phone ? 0xff : 0));
    }, 20);
  }
  talking = false;

  private push(frame: Buffer) {
    const b64 = frame.toString("base64");
    for (const h of this.audio) h(b64);
  }

  async speak(text: string) {
    const pcm = speech(text, this.phone);
    const frame = 20 * this.bytesPerMs;
    this.talking = true;
    log(`caller ▶ ${text}`);
    const start = Date.now();
    for (let i = 0; i < pcm.length; i += frame) {
      this.push(pcm.subarray(i, i + frame));
      const due = start + ((i + frame) / this.bytesPerMs);
      await new Promise((r) => setTimeout(r, Math.max(0, due - Date.now())));
    }
    this.talking = false;
  }

  type(text: string) {
    log(`caller ⌨ ${text}`);
    for (const h of this.text) h(text);
  }

  onAudio(h: (b64: string) => void) { this.audio.push(h); }
  onText(h: (t: string) => void) { this.text.push(h); }
  onDtmf() {}
  onClose(h: (reason: string) => void) { this.closers.push(h); }
  sendAudio(b64: string) {
    const frame = Buffer.from(b64, "base64");
    if (opts.save) this.agentAudio.push(frame);
    const ms = frame.length / this.bytesPerMs;
    this.playUntil = Math.max(Date.now(), this.playUntil) + ms;
    this.lastAgentAudio = Date.now();
  }
  clearPlayback() {
    const left = Math.max(0, this.playUntil - Date.now());
    if (left > 0) log(`✂ playback cleared with ${(left / 1000).toFixed(1)}s of agent audio unplayed`);
    this.playUntil = Date.now();
  }
  async awaitPlayback(timeoutMs = 8000) {
    await new Promise((r) => setTimeout(r, Math.min(timeoutMs, Math.max(0, this.playUntil - Date.now()))));
  }
  sendEvent(e: Record<string, unknown>) {
    switch (e.type) {
      case "transcript":
        if (e.role === "agent") log(`agent ◀ ${e.text}  [audio queued ${(Math.max(0, this.playUntil - Date.now()) / 1000).toFixed(1)}s]`);
        else if (e.role === "user" && typeof e.line === "string") this.heard.set(e.line, String(e.text));
        break;
      case "tool":
        log(`tool  ${e.name} ${e.status}${e.summary ? ` — ${e.summary}` : ""}`);
        break;
      case "error":
        log(`error ${e.message}`);
        break;
    }
  }
  close(reason: string) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.silence);
    log(`leg closed: ${reason}`);
    for (const h of this.closers) h(reason);
  }
  /** Waits for the agent to start answering (up to `ms`). */
  async reply(since: number, ms = 15_000) {
    const deadline = Date.now() + ms;
    while (this.lastAgentAudio < since && Date.now() < deadline && !this.closed) await new Promise((r) => setTimeout(r, 100));
  }
  /** Agent finished talking and has been quiet for `ms`. */
  async quiet(ms: number) {
    for (;;) {
      const busy = Math.max(this.playUntil, this.lastAgentAudio + ms) - Date.now();
      if (busy <= 0 || this.closed) return;
      await new Promise((r) => setTimeout(r, Math.min(busy, 250)));
    }
  }
}

/** A WAV file around raw frames: μ-law 8 kHz on the phone, 16-bit PCM 24 kHz in the browser. */
function wav(data: Buffer, phone: boolean): Buffer {
  const [format, rate, bits] = phone ? [7, 8000, 8] : [1, 24_000, 16];
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(format, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE((rate * bits) / 8, 28);
  header.writeUInt16LE(bits / 8, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function main() {
  const profile = getAgent(opts.agent);
  if (!profile) throw new Error(`Unknown agent ${opts.agent}`);
  const kase = opts.caseRef ? await prisma.case.findUniqueOrThrow({ where: { ref: opts.caseRef } }) : null;
  const brief = kase && profile.buildBrief ? await profile.buildBrief(kase.id) : null;
  const call = await prisma.call.create({
    data: {
      ref: await nextRef("call"),
      direction: profile.direction === "outbound" ? "OUTBOUND" : "INBOUND",
      channel: opts.channel,
      agentProfile: profile.id,
      caseId: kase?.id ?? null,
      language: opts.language || null,
      placedBy: "probe",
      outcome: brief ? ({ brief } as Prisma.InputJsonValue) : undefined,
    },
  });
  log(`${call.ref} · ${profile.label} · ${opts.channel}${kase ? ` · ${kase.ref}` : ""}${opts.language ? ` · ${opts.language}` : ""}`);

  const leg = new ProbeLeg(opts.channel === "PHONE");
  const controls: CallControls | undefined =
    opts.channel === "PHONE"
      ? {
          async hangup() { log("☎ agent hung up"); leg.close("agent hung up"); },
          async transfer(target, summary) { log(`☎ transfer to ${target}: ${summary}`); return { ok: true, message: "Transferring now." }; },
          async fallback() { log("☎ fallback to a case manager"); return { transferredTo: null }; },
        }
      : undefined;
  const session = runVoiceSession({ leg, profile, callId: call.id, controls, brief });

  await leg.reply(1); // the agent speaks first
  await leg.quiet(2500);
  for (const turn of opts.turns) {
    if (leg.closed) break;
    if (turn.typed) leg.type(turn.text);
    else await leg.speak(turn.text);
    await leg.reply(Date.now());
    await leg.quiet(opts.gapMs + 2500);
  }
  // Stay silent on the line (tests the agent re-engaging a quiet caller).
  if (opts.holdMs && !leg.closed) {
    log(`caller stays silent for ${opts.holdMs / 1000}s`);
    await new Promise((r) => setTimeout(r, opts.holdMs));
    await leg.quiet(1500);
  }
  if (!leg.closed) leg.close("caller hung up");
  for (const text of leg.heard.values()) log(`heard ▷ ${text}`);
  if (opts.save) {
    writeFileSync(opts.save, wav(Buffer.concat(leg.agentAudio), leg.phone));
    log(`agent audio saved to ${opts.save}`);
  }
  // Resolves once the session has saved its outcome and summary.
  await session;
  const done = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
  log(`status ${done.status} · ${done.durationSec}s · outcome ${JSON.stringify(done.outcome)}`);
  if (done.summary) log(`summary: ${done.summary}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
