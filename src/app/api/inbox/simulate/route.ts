import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { processInbound, receiveInbound } from "@/lib/intake/intake";
import { withOfflineAI } from "@/lib/services/ai";
import { EMAIL_SAMPLES, FAX_SAMPLES } from "@/lib/intake/samples";

export const dynamic = "force-dynamic";

const Body = z.object({ kind: z.enum(["email", "fax"]), sample: z.string() });

/** Feeds a bundled fictional e-mail or fax through the real intake pipeline. */
export const POST = withErrorHandling(async (req: Request) => {
  const { kind, sample } = Body.parse(await req.json().catch(() => ({})));
  const publicDir = path.join(process.cwd(), "public");
  const read = async (rel: string) => ({ filename: path.basename(rel), buffer: await fs.readFile(path.join(publicDir, rel)) });

  let message;
  let files;
  if (kind === "email") {
    const s = EMAIL_SAMPLES.find((e) => e.id === sample);
    if (!s) throw notFound("Sample e-mail");
    files = await Promise.all(s.attachments.map(read));
    message = await receiveInbound({ channel: "EMAIL", from: s.from, to: s.to, subject: s.subject, body: s.body, files });
  } else {
    const s = FAX_SAMPLES.find((f) => f.id === sample);
    if (!s) throw notFound("Sample fax");
    files = [await read(s.file)];
    message = await receiveInbound({ channel: "FAX", from: s.from, to: s.to, files });
  }
  // A bundled sample, so its replies and figures stay the rehearsed ones.
  const processed = await withOfflineAI(() => processInbound(message.id, files));
  return json({ message: serialize(processed) }, { status: 201 });
});

/** The available samples (for the Inbox page). */
export const GET = withErrorHandling(async () => {
  return json({
    emails: EMAIL_SAMPLES.map((e) => ({ id: e.id, label: e.label })),
    faxes: FAX_SAMPLES.map((f) => ({ id: f.id, label: f.label })),
  });
});
