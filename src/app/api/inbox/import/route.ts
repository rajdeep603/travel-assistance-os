import { json, serialize, withErrorHandling } from "@/lib/api";
import { env } from "@/lib/env";
import { badRequest } from "@/lib/errors";
import { looksLikeEml, parseEml } from "@/lib/intake/eml";
import { processInbound, receiveInbound, type InboundInput } from "@/lib/intake/intake";
import { FAX_SAMPLES } from "@/lib/intake/samples";
import { sniffType } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * Brings a message in by hand: a saved e-mail (.eml) with its attachments, or
 * a received fax (PDF). Runs the same intake pipeline as the e-mail and fax
 * webhooks.
 */
export const POST = withErrorHandling(async (req: Request) => {
  const form = await req.formData().catch(() => {
    throw badRequest("Expected a file upload.");
  });
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw badRequest("Choose an .eml e-mail or a fax PDF.");
  if (file.size > env.maxUploadBytes * 2) throw badRequest(`"${file.name}" is too large.`);
  const buffer = Buffer.from(await file.arrayBuffer());

  let input: InboundInput;
  if (sniffType(buffer) === "application/pdf") {
    // A fax: the sender's number, when given, lets a cost estimate find its hospital.
    const given = typeof form.get("from") === "string" ? (form.get("from") as string).trim() : "";
    const base = file.name.replace(/\s*\(\d+\)(?=\.pdf$)/i, "");
    const known = FAX_SAMPLES.find((f) => f.file.endsWith(`/${base}`));
    input = { channel: "FAX", from: given || known?.from || "Unknown fax number", to: known?.to ?? null, files: [{ filename: file.name, buffer }] };
  } else if (looksLikeEml(buffer, file.name)) {
    input = await parseEml(buffer);
  } else {
    throw badRequest(`"${file.name}": import an .eml e-mail or a fax PDF.`);
  }

  const message = await receiveInbound(input);
  const processed = await processInbound(message.id, input.files);
  return json({ message: serialize(processed) }, { status: 201 });
});
