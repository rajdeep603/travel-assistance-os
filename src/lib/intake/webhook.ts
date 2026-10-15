import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/errors";

/** Constant-time check of the secret embedded in an inbound webhook path. */
export function assertWebhookSecret(given: string, expected: string): void {
  if (!expected) throw new ApiError("Inbound intake is not configured on this server.", 503, "INTAKE_NOT_CONFIGURED");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError("Not found.", 404, "NOT_FOUND");
}

/** Every File field in a multipart form, as name + bytes. */
export async function formFiles(form: FormData): Promise<{ filename: string; buffer: Buffer }[]> {
  const files: { filename: string; buffer: Buffer }[] = [];
  for (const [, value] of form.entries()) {
    if (value instanceof File && value.size > 0) {
      files.push({ filename: value.name || "attachment.pdf", buffer: Buffer.from(await value.arrayBuffer()) });
    }
  }
  return files;
}
