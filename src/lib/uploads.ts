import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { ApiError, badRequest } from "./errors";

// ---------------------------------------------------------------------------
// Shared upload handling for every intake path (web uploads, claim packs,
// later email and fax): type/size checks against the file's actual bytes,
// and storage under UPLOAD_DIR (a Docker volume in production).
// ---------------------------------------------------------------------------

export const ALLOWED_UPLOAD_TYPES = new Set(["application/pdf", "text/plain"]);

const PDF_MAGIC = Buffer.from("%PDF-");

/** Detects the real type from the content; the browser's MIME is only a hint. */
export function sniffType(buffer: Buffer): "application/pdf" | "text/plain" | null {
  if (buffer.subarray(0, 1024).includes(PDF_MAGIC)) return "application/pdf";
  // Plain text: valid UTF-8 without NUL bytes in the first 8 KB.
  const head = buffer.subarray(0, 8192);
  if (head.includes(0)) return null;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head);
    return "text/plain";
  } catch {
    return null;
  }
}

/** Validates an upload and returns its bytes plus the content-derived type. */
export async function readUpload(
  file: File
): Promise<{ buffer: Buffer; mimeType: "application/pdf" | "text/plain" }> {
  if (file.size === 0) throw badRequest(`"${file.name}" is empty.`);
  if (file.size > env.maxUploadBytes) {
    throw badRequest(
      `"${file.name}" is too large (max ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB).`
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffType(buffer);
  if (!mimeType || !ALLOWED_UPLOAD_TYPES.has(mimeType)) {
    throw badRequest(`"${file.name}": only PDF and plain-text documents are accepted.`);
  }
  return { buffer, mimeType };
}

/** Writes bytes under UPLOAD_DIR with a collision-free, sanitised name. */
export async function storeUpload(originalName: string, buffer: Buffer): Promise<string> {
  const dir = path.resolve(env.uploadDir);
  await fs.mkdir(dir, { recursive: true });
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await fs.writeFile(path.join(dir, safeName), buffer);
  return `uploads/${safeName}`;
}

/** A processing failure message that is safe to show to the user. */
export function processingErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "The document could not be processed. Please check it is a valid, readable PDF.";
}
