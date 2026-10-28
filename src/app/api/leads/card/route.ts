import { json, withErrorHandling } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { CARD_MAX_BYTES, readBusinessCard } from "@/lib/services/business-cards";

export const dynamic = "force-dynamic";

/**
 * Reads a photographed business card (multipart form, field "file": a JPEG,
 * PNG or WebP image up to 10 MB) into a draft for the presenter to check.
 * The photo isn't stored. Without a live model the draft comes back empty,
 * with a note, rather than as an error.
 */
export const POST = withErrorHandling(async (req: Request) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest('Expected a multipart form upload with a "file" field.');
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw badRequest("Take a photo of the card, or choose one.");
  if (file.size > CARD_MAX_BYTES) throw badRequest(`The photo is too large (max ${CARD_MAX_BYTES / 1024 / 1024} MB).`);
  const reading = await readBusinessCard({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name || "card.jpg" });
  return json(reading);
});
