import fs from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { processInbound, receiveInbound, type InboundInput } from "@/lib/intake/intake";
import { EMAIL_SAMPLES, FAX_SAMPLES, WHATSAPP_SAMPLES } from "@/lib/intake/samples";
import { withOfflineAI } from "@/lib/services/ai";
import { deleteInboundMessage } from "@/lib/services/erase";

export type SampleKind = "email" | "fax" | "whatsapp";

/** How a received sample's copies are tagged, so the next receive finds the previous one. */
const sampleTag = (kind: SampleKind, sample: string) => `sample:${kind}:${sample}:`;

const whatsappAddress = (from: string) => `whatsapp:${from.replace(/[^\d+]/g, "")}`;

/**
 * The copies of a sample already in the Inbox: the tagged ones, and untagged
 * ones received before copies were tagged (the same sender and subject, or
 * the same fax file). Never a seeded message (refs MSG-09xx): the hotline
 * scripts quote the letters those produced.
 */
async function previousCopies(kind: SampleKind, sample: string, like: Prisma.InboundMessageWhereInput): Promise<{ id: string }[]> {
  return prisma.inboundMessage.findMany({
    where: {
      OR: [
        { externalId: { startsWith: sampleTag(kind, sample) } },
        { ...like, externalId: null, NOT: [{ ref: { startsWith: "MSG-09" } }] },
      ],
    },
    select: { id: true },
  });
}

/**
 * Feeds a bundled fictional e-mail, fax or WhatsApp message through the real
 * intake pipeline, as if it had just arrived: the Inbox's "Receive a sample",
 * ⌘K's "Receive: …" and the voice page's "Make it ready" all use this.
 * Received again (the next meeting), it replaces its previous copies and
 * everything they produced, so the seeded case shows one of each.
 */
export async function receiveSample(kind: SampleKind, sample: string) {
  const publicDir = path.join(process.cwd(), "public");
  const read = async (rel: string) => ({ filename: path.basename(rel), buffer: await fs.readFile(path.join(publicDir, rel)) });

  let input: Omit<InboundInput, "externalId">;
  let like: Prisma.InboundMessageWhereInput;
  if (kind === "email") {
    const s = EMAIL_SAMPLES.find((e) => e.id === sample);
    if (!s) throw notFound("Sample e-mail");
    const files = await Promise.all(s.attachments.map(read));
    input = { channel: "EMAIL", from: s.from, to: s.to, subject: s.subject, body: s.body, files };
    like = { channel: "EMAIL", fromAddress: s.from, subject: s.subject };
  } else if (kind === "whatsapp") {
    const s = WHATSAPP_SAMPLES.find((w) => w.id === sample);
    if (!s) throw notFound("Sample WhatsApp message");
    const files = await Promise.all(s.attachments.map(read));
    input = { channel: "WHATSAPP", from: whatsappAddress(s.from), to: "whatsapp:assistance", body: s.body, files };
    like = { channel: "WHATSAPP", fromAddress: whatsappAddress(s.from), bodyText: s.body };
  } else {
    const s = FAX_SAMPLES.find((f) => f.id === sample);
    if (!s) throw notFound("Sample fax");
    input = { channel: "FAX", from: s.from, to: s.to, files: [await read(s.file)] };
    like = { channel: "FAX", fromAddress: s.from, documents: { some: { filename: path.basename(s.file) } } };
  }

  for (const previous of await previousCopies(kind, sample, like)) await deleteInboundMessage(previous.id, { replacingSample: true });
  const message = await receiveInbound({ ...input, externalId: `${sampleTag(kind, sample)}${Date.now()}` });
  // A bundled sample, so its replies and figures stay the rehearsed ones.
  return withOfflineAI(() => processInbound(message.id, input.files));
}
