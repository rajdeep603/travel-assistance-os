import { processInbound, receiveInbound, type InboundFile } from "@/lib/intake/intake";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/errors";
import { readTwilioRequest, twiml } from "@/lib/twilio-webhook";
import { getTelephony } from "@/lib/services/telephony";

export const dynamic = "force-dynamic";

const EXTENSIONS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "text/plain": "txt" };

/**
 * Twilio's WhatsApp webhook (the sandbox or an approved sender's "when a
 * message comes in" URL): the message and its photos or PDFs go through the
 * same intake as e-mail, and the reply goes back on WhatsApp. Acknowledged at
 * once; processed in the background of the long-running server.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    return await receive(req);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 503)) return new NextResponse(err.message, { status: err.status });
    console.error("[whatsapp] webhook failed:", err);
    // An empty reply: Twilio doesn't retry, and the traveller gets no error text.
    return twiml("");
  }
}

async function receive(req: Request): Promise<Response> {
  const params = await readTwilioRequest(req);
  const files: InboundFile[] = [];
  const count = Math.min(Number(params.NumMedia ?? 0) || 0, 5);
  for (let i = 0; i < count; i++) {
    const url = params[`MediaUrl${i}`];
    if (!url) continue;
    const type = params[`MediaContentType${i}`] ?? "";
    try {
      files.push({ filename: `whatsapp-${params.MessageSid ?? "media"}-${i + 1}.${EXTENSIONS[type] ?? "bin"}`, buffer: await getTelephony().fetchMedia(url) });
    } catch (err) {
      console.error("[whatsapp] media download failed:", err);
    }
  }
  const message = await receiveInbound({
    channel: "WHATSAPP",
    externalId: params.MessageSid ?? null,
    from: params.From ?? "whatsapp:unknown",
    to: params.To ?? null,
    subject: params.ProfileName ? `WhatsApp from ${params.ProfileName}` : null,
    body: params.Body ?? null,
    files,
  });
  if (message.status === "RECEIVED") void processInbound(message.id, files);
  return twiml("");
}
