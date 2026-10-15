import { json, withErrorHandling } from "@/lib/api";
import { env } from "@/lib/env";
import { badRequest } from "@/lib/errors";
import { processInbound, receiveInbound } from "@/lib/intake/intake";
import { assertWebhookSecret, formFiles } from "@/lib/intake/webhook";

export const dynamic = "force-dynamic";

/**
 * Twilio SendGrid Inbound Parse webhook (MX for inbound.<domain> →
 * mx.sendgrid.net; Parse URL https://<domain>/api/inbound/email/<secret>).
 * Acknowledges at once — SendGrid retries slow endpoints — and processes in
 * the background of the long-running server.
 */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { secret: string } }) => {
  assertWebhookSecret(params.secret, env.inboundEmailSecret);
  const form = await req.formData().catch(() => {
    throw badRequest("Expected the multipart payload from SendGrid Inbound Parse.");
  });
  const field = (name: string) => (typeof form.get(name) === "string" ? (form.get(name) as string) : null);
  const messageId = field("headers")?.match(/^Message-ID:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const files = await formFiles(form);
  const message = await receiveInbound({
    channel: "EMAIL",
    externalId: messageId,
    from: field("from") ?? "unknown sender",
    to: field("to"),
    subject: field("subject"),
    body: field("text") ?? field("html")?.replace(/<[^>]+>/g, " ") ?? null,
    files,
  });
  if (message.status === "RECEIVED") void processInbound(message.id, files);
  return json({ received: message.ref });
});
