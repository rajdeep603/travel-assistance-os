import { json, withErrorHandling } from "@/lib/api";
import { env } from "@/lib/env";
import { badRequest } from "@/lib/errors";
import { processInbound, receiveInbound } from "@/lib/intake/intake";
import { assertWebhookSecret, formFiles } from "@/lib/intake/webhook";

export const dynamic = "force-dynamic";

/**
 * Inbound fax webhook (provider-agnostic multipart: from, to, id, and the fax
 * PDF as any file field). A provider adapter maps its own payload onto this.
 */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { secret: string } }) => {
  assertWebhookSecret(params.secret, env.inboundFaxSecret);
  const form = await req.formData().catch(() => {
    throw badRequest("Expected a multipart fax payload.");
  });
  const field = (name: string) => (typeof form.get(name) === "string" ? (form.get(name) as string) : null);
  const files = await formFiles(form);
  if (files.length === 0) throw badRequest("The fax had no document.");
  const message = await receiveInbound({
    channel: "FAX",
    externalId: field("id"),
    from: field("from") ?? "unknown fax",
    to: field("to"),
    subject: null,
    body: null,
    files,
  });
  if (message.status === "RECEIVED") void processInbound(message.id, files);
  return json({ received: message.ref });
});
