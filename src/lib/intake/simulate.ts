import fs from "node:fs/promises";
import path from "node:path";
import { notFound } from "@/lib/errors";
import { processInbound, receiveInbound } from "@/lib/intake/intake";
import { EMAIL_SAMPLES, FAX_SAMPLES, WHATSAPP_SAMPLES } from "@/lib/intake/samples";
import { withOfflineAI } from "@/lib/services/ai";

export type SampleKind = "email" | "fax" | "whatsapp";

/**
 * Feeds a bundled fictional e-mail, fax or WhatsApp message through the real
 * intake pipeline, as if it had just arrived: the Inbox's "Receive a sample",
 * ⌘K's "Receive: …" and the voice page's "Make it ready" all use this.
 */
export async function receiveSample(kind: SampleKind, sample: string) {
  const publicDir = path.join(process.cwd(), "public");
  const read = async (rel: string) => ({ filename: path.basename(rel), buffer: await fs.readFile(path.join(publicDir, rel)) });

  let message;
  let files;
  if (kind === "email") {
    const s = EMAIL_SAMPLES.find((e) => e.id === sample);
    if (!s) throw notFound("Sample e-mail");
    files = await Promise.all(s.attachments.map(read));
    message = await receiveInbound({ channel: "EMAIL", from: s.from, to: s.to, subject: s.subject, body: s.body, files });
  } else if (kind === "whatsapp") {
    const s = WHATSAPP_SAMPLES.find((w) => w.id === sample);
    if (!s) throw notFound("Sample WhatsApp message");
    files = await Promise.all(s.attachments.map(read));
    message = await receiveInbound({ channel: "WHATSAPP", from: `whatsapp:${s.from.replace(/[^\d+]/g, "")}`, to: "whatsapp:assistance", body: s.body, files });
  } else {
    const s = FAX_SAMPLES.find((f) => f.id === sample);
    if (!s) throw notFound("Sample fax");
    files = [await read(s.file)];
    message = await receiveInbound({ channel: "FAX", from: s.from, to: s.to, files });
  }
  // A bundled sample, so its replies and figures stay the rehearsed ones.
  return withOfflineAI(() => processInbound(message.id, files));
}
