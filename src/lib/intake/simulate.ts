import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { processInbound, receiveInbound } from "@/lib/intake/intake";
import { EMAIL_SAMPLES, FAX_SAMPLES, WHATSAPP_SAMPLES } from "@/lib/intake/samples";
import { withOfflineAI } from "@/lib/services/ai";
import { deleteInboundMessage } from "@/lib/services/erase";

export type SampleKind = "email" | "fax" | "whatsapp";

/** How a received sample's copies are tagged, so the next receive finds the previous one. */
const sampleTag = (kind: SampleKind, sample: string) => `sample:${kind}:${sample}:`;

/**
 * Feeds a bundled fictional e-mail, fax or WhatsApp message through the real
 * intake pipeline, as if it had just arrived: the Inbox's "Receive a sample",
 * ⌘K's "Receive: …" and the voice page's "Make it ready" all use this.
 * Received again (the next meeting), it replaces its previous copy and
 * everything that copy produced, so the seeded case shows one of each.
 */
export async function receiveSample(kind: SampleKind, sample: string) {
  const publicDir = path.join(process.cwd(), "public");
  const read = async (rel: string) => ({ filename: path.basename(rel), buffer: await fs.readFile(path.join(publicDir, rel)) });

  const previous = await prisma.inboundMessage.findMany({ where: { externalId: { startsWith: sampleTag(kind, sample) } }, select: { id: true } });
  for (const p of previous) await deleteInboundMessage(p.id, { replacingSample: true });
  const externalId = `${sampleTag(kind, sample)}${Date.now()}`;

  let message;
  let files;
  if (kind === "email") {
    const s = EMAIL_SAMPLES.find((e) => e.id === sample);
    if (!s) throw notFound("Sample e-mail");
    files = await Promise.all(s.attachments.map(read));
    message = await receiveInbound({ channel: "EMAIL", externalId, from: s.from, to: s.to, subject: s.subject, body: s.body, files });
  } else if (kind === "whatsapp") {
    const s = WHATSAPP_SAMPLES.find((w) => w.id === sample);
    if (!s) throw notFound("Sample WhatsApp message");
    files = await Promise.all(s.attachments.map(read));
    message = await receiveInbound({ channel: "WHATSAPP", externalId, from: `whatsapp:${s.from.replace(/[^\d+]/g, "")}`, to: "whatsapp:assistance", body: s.body, files });
  } else {
    const s = FAX_SAMPLES.find((f) => f.id === sample);
    if (!s) throw notFound("Sample fax");
    files = [await read(s.file)];
    message = await receiveInbound({ channel: "FAX", externalId, from: s.from, to: s.to, files });
  }
  // A bundled sample, so its replies and figures stay the rehearsed ones.
  return withOfflineAI(() => processInbound(message.id, files));
}
