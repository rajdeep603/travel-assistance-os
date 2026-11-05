// ---------------------------------------------------------------------------
// Runs the live interpreter end to end against the real Grok Voice API with
// two scripted sides instead of people: a case manager in the browser (PCM
// 24 kHz) and a hospital on the phone (μ-law 8 kHz), each speaking with a
// macOS voice in real time. Prints, per sentence, what each side said, the
// translation the other side heard and how long it took, and every cut-off
// translation. --echo 0.3 leaks each side's played translation back into
// the other side's microphone (a phone on speaker next to the laptop), at
// that gain, after --echo-delay ms.
//
//   npx tsx scripts/interpreter-probe.ts --lang es [--echo 0.3] [--pause-mid]
//
// Needs XAI_API_KEY, the local database and macOS. Development only.
// ---------------------------------------------------------------------------

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { nextRef } from "@/lib/refs";
import type { CallControls } from "@/lib/voice/bridge";
import { linearToMulaw, mulawToLinear } from "@/lib/voice/g711";
import { joinAsHospital, joinAsManager } from "@/lib/voice/interpreter";
import type { VoiceLeg } from "@/lib/voice/legs/types";
import type { AudioFormat } from "@/lib/voice/realtime/xai-session";

const VOICES: Record<string, string> = { en: "Samantha", es: "Mónica", "es-ES": "Mónica", tr: "Yelda", ar: "Majed", hi: "Lekha", fr: "Thomas", de: "Anna", it: "Alice", ru: "Milena" };

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const value = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const LANG = value("--lang", "es-ES");
const ECHO = Number(value("--echo", "0"));
const ECHO_DELAY_MS = Number(value("--echo-delay", "180"));
const PAUSE_MID = flag("--pause-mid");
/** Hall noise on both microphones: white noise at this amplitude, plus babble (other people talking) at this gain. */
const NOISE = Number(value("--noise", "0"));
const BABBLE = Number(value("--babble", "0"));

const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`;
const log = (...parts: unknown[]) => console.log(stamp(), ...parts);

/** Speech as 16-bit samples at `rate`. */
function speech(text: string, voice: string, rate: number): Int16Array {
  const dir = mkdtempSync(path.join(tmpdir(), "iprobe-"));
  const aiff = path.join(dir, "t.aiff");
  const wav = path.join(dir, "t.wav");
  execFileSync("say", ["-v", voice, "-o", aiff, text]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${rate}`, "-c", "1", aiff, wav]);
  const buf = readFileSync(wav);
  const data = buf.indexOf("data");
  const pcm = buf.subarray(data + 8);
  return new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length - (pcm.length % 2)));
}

class Side implements VoiceLeg {
  readonly kind: "browser" | "twilio";
  readonly format: AudioFormat;
  readonly rate: number;
  private audioHandlers: ((b64: string) => void)[] = [];
  private closers: ((r: string) => void)[] = [];
  /** Samples still to say (the speaker's own voice), and leaked echo to mix in. */
  private voice: number[] = [];
  private echo: number[] = [];
  /** When the translation queued for this side finishes playing. */
  playUntil = 0;
  lastAudioAt = 0;
  received: { at: number; ms: number }[] = [];
  /** The other side's microphone, for echo. */
  peer: Side | null = null;
  closed = false;
  private timer: NodeJS.Timeout;
  constructor(readonly name: "manager" | "hospital") {
    const phone = name === "hospital";
    this.kind = phone ? "twilio" : "browser";
    this.format = phone ? { type: "audio/pcmu" } : { type: "audio/pcm", rate: 24_000 };
    this.rate = phone ? 8000 : 24_000;
    // The browser sends 40 ms chunks; Twilio 20 ms frames.
    const frameMs = phone ? 20 : 40;
    const perFrame = (this.rate * frameMs) / 1000;
    this.timer = setInterval(() => {
      const frame = new Int16Array(perFrame);
      for (let i = 0; i < perFrame; i++) {
        const v = (this.voice.length ? this.voice.shift()! : 0) + (this.echo.length ? this.echo.shift()! : 0) + this.hall();
        frame[i] = Math.max(-32768, Math.min(32767, v + (Math.random() - 0.5) * (60 + NOISE)));
      }
      const bytes = phone ? Buffer.from(Array.from(frame, (s) => linearToMulaw(s))) : Buffer.from(frame.buffer);
      const b64 = bytes.toString("base64");
      for (const h of this.audioHandlers) h(b64);
    }, frameMs);
  }
  private babble: Int16Array | null = null;
  private babblePos = 0;
  /** Other people talking nearby, looped. */
  private hall(): number {
    if (!BABBLE) return 0;
    if (!this.babble) {
      const parts = [
        ["Daniel", "So the booth on the left has the new claims platform, we should go and see it after lunch."],
        ["Karen", "I think the session on medical tourism starts at two, are you coming with us or staying here?"],
        ["Moira", "Did you get their card? They said they'd send the proposal on Friday."],
        ["Rishi", "The coffee here is much better than yesterday, let's grab one before the next meeting."],
      ].map(([v, t]) => speech(t, v, this.rate));
      const len = Math.max(...parts.map((p) => p.length));
      this.babble = new Int16Array(len);
      for (const p of parts) for (let i = 0; i < p.length; i++) this.babble[i] += p[i] / 2;
    }
    const v = this.babble[this.babblePos] * BABBLE;
    this.babblePos = (this.babblePos + 1) % this.babble.length;
    return v;
  }
  get talking() {
    return this.voice.length > 0;
  }
  say(text: string, lang: string): Promise<void> {
    const samples = speech(text, VOICES[lang] ?? "Samantha", this.rate);
    log(`${this.name.padEnd(8)} ▶ ${text}`);
    for (const s of samples) this.voice.push(s);
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (!this.voice.length) {
          clearInterval(t);
          resolve();
        }
      }, 20);
    });
  }
  /** Leaked sound from the other side's loudspeaker, at this side's rate. */
  leak(samples: Int16Array, fromRate: number) {
    const ratio = this.rate / fromRate;
    const pad = Math.max(0, Math.round((ECHO_DELAY_MS / 1000) * this.rate) - this.echo.length);
    for (let i = 0; i < pad; i++) this.echo.push(0);
    const n = Math.floor(samples.length * ratio);
    for (let i = 0; i < n; i++) this.echo.push(samples[Math.min(samples.length - 1, Math.floor(i / ratio))] * ECHO);
  }
  onAudio(h: (b64: string) => void) {
    this.audioHandlers.push(h);
  }
  onText() {}
  onDtmf() {}
  onClose(h: (r: string) => void) {
    this.closers.push(h);
  }
  sendAudio(b64: string) {
    const bytes = Buffer.from(b64, "base64");
    const samples = this.kind === "twilio" ? Int16Array.from(bytes, (b) => mulawToLinear(b)) : new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length - (bytes.length % 2)));
    const ms = (samples.length / this.rate) * 1000;
    this.playUntil = Math.max(Date.now(), this.playUntil) + ms;
    this.lastAudioAt = Date.now();
    this.received.push({ at: Date.now(), ms });
    if (ECHO > 0 && this.peer) this.peer.leak(samples, this.rate);
  }
  clearPlayback() {
    this.playUntil = Date.now();
  }
  async awaitPlayback(timeoutMs = 8000) {
    await new Promise((r) => setTimeout(r, Math.min(timeoutMs, Math.max(0, this.playUntil - Date.now()))));
  }
  captions: { at: number; side: string; kind: string; text: string; line?: string }[] = [];
  sendEvent(e: Record<string, unknown>) {
    if (e.type === "caption") {
      const c = { at: Date.now(), side: String(e.side), kind: String(e.kind), text: String(e.text), line: e.line as string | undefined };
      const same = c.line ? this.captions.find((x) => x.line === c.line) : undefined;
      if (same) same.text = c.text;
      else this.captions.push(c);
      if (c.kind === "translation") log(`${c.side.padEnd(8)} → ${c.text}`);
    } else if (e.type === "bridge_status") log(`status ${e.status}`);
    else if (e.type === "error") log(`error ${e.message}`);
  }
  close(reason: string) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    log(`${this.name} closed: ${reason}`);
    for (const h of this.closers) h(reason);
  }
  /** The translation for this side has played and nothing new came for `ms`. */
  async heard(since: number, ms = 900, max = 20_000) {
    const deadline = Date.now() + max;
    while (Date.now() < deadline && !this.closed) {
      const started = this.lastAudioAt >= since;
      if (started && Date.now() > this.playUntil + ms && Date.now() > this.lastAudioAt + ms) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return this.lastAudioAt >= since;
  }
}

type Turn = { side: "manager" | "hospital"; text: string; then?: string };

const SCRIPTS: Record<string, Turn[]> = {
  "es-ES": [
    { side: "manager", text: "Good morning. I'm calling from Global Excel about a patient, Margaret Thompson, born on the eighteenth of May, nineteen sixty-two." },
    { side: "hospital", text: "Buenos días. Sí, la tenemos en el sistema. ¿Qué necesita?" },
    { side: "manager", text: "We need her medical report.", then: "And the itemised invoice for her stay, please." },
    { side: "hospital", text: "El informe médico se lo enviamos hoy. La factura detallada, el viernes." },
    { side: "manager", text: "Perfect. Can you send them to the secure link I e-mailed?" },
    { side: "hospital", text: "Sí, claro. Lo subimos al enlace." },
    { side: "manager", text: "Thank you very much. Goodbye." },
  ],
};

async function main() {
  const script = SCRIPTS[LANG] ?? SCRIPTS["es-ES"];
  const bridgeId = randomUUID();
  const hospitalRef = await nextRef("call");
  await prisma.call.create({ data: { ref: hospitalRef, direction: "OUTBOUND", channel: "PHONE", agentProfile: "interpreter", status: "RINGING", toNumber: "+10000000000", bridgeId, outcome: { languages: { manager: "en", hospital: LANG }, context: "a Global Excel case manager speaking with a hospital's international office about a patient's medical claim", client: "Global Excel" } } });
  const managerRef = await nextRef("call");
  await prisma.call.create({ data: { ref: managerRef, direction: "OUTBOUND", channel: "BROWSER", agentProfile: "interpreter", status: "RINGING", bridgeId } });
  log(`bridge ${bridgeId.slice(0, 8)} · ${managerRef}/${hospitalRef} · en ⇄ ${LANG}${ECHO ? ` · echo ${ECHO} after ${ECHO_DELAY_MS} ms` : ""}${PAUSE_MID ? " · pause mid-sentence" : ""}${NOISE ? ` · noise ${NOISE}` : ""}${BABBLE ? ` · babble ${BABBLE}` : ""}`);

  const manager = new Side("manager");
  const hospital = new Side("hospital");
  manager.peer = hospital; // the manager's loudspeaker leaks into the phone
  hospital.peer = manager; // the phone's loudspeaker leaks into the laptop
  const controls: CallControls = {
    async transfer() {
      return { ok: false, message: "no transfer in a probe" };
    },
    async fallback() {
      return { transferredTo: null };
    },
    async hangup() {},
  };
  void joinAsManager(bridgeId, manager);
  await new Promise((r) => setTimeout(r, 300));
  void joinAsHospital(bridgeId, hospital, controls);

  // The opening line the bridge plays to the hospital.
  await hospital.heard(t0, 900, 15_000);

  const results: { turn: number; side: string; said: string; translated: boolean; latencyMs: number | null }[] = [];
  for (const [i, turn] of script.entries()) {
    const speaker = turn.side === "manager" ? manager : hospital;
    const listener = turn.side === "manager" ? hospital : manager;
    const lang = turn.side === "manager" ? "en" : LANG;
    const start = Date.now();
    await speaker.say(turn.text, lang);
    if (turn.then) {
      if (PAUSE_MID) await new Promise((r) => setTimeout(r, 1100));
      await speaker.say(turn.then, lang);
    }
    const ended = Date.now();
    const ok = await listener.heard(ended - 200);
    const first = listener.received.find((r) => r.at >= ended - 200);
    results.push({ turn: i + 1, side: turn.side, said: turn.text + (turn.then ? ` ${turn.then}` : ""), translated: ok, latencyMs: first ? first.at - ended : null });
    void start;
    await new Promise((r) => setTimeout(r, 400));
  }
  await new Promise((r) => setTimeout(r, 2500));
  manager.close("probe done");
  await new Promise((r) => setTimeout(r, 3000));

  console.log("\n== Per sentence");
  for (const r of results) console.log(`${String(r.turn).padStart(2)} ${r.side.padEnd(8)} ${r.translated ? "translated" : "NOT TRANSLATED"}${r.latencyMs != null ? ` after ${(r.latencyMs / 1000).toFixed(1)}s` : ""} · ${r.said.slice(0, 80)}`);
  const caps = manager.captions;
  console.log("\n== Captions (what each side said, and the rendering)");
  for (const c of caps) console.log(`${c.side.padEnd(8)} ${c.kind === "translation" ? "→" : " "} ${c.text.slice(0, 140)}`);
  const missed = results.filter((r) => !r.translated).length;
  console.log(`\nSUMMARY: ${results.length - missed}/${results.length} translated`);
  await prisma.call.deleteMany({ where: { bridgeId } }).catch(() => undefined);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
