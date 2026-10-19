import fs from "node:fs/promises";
import path from "node:path";
import { withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { notFound } from "@/lib/errors";
import { ALLOWED_UPLOAD_TYPES, type UploadType } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/** Streams a stored document (uploads, received e-mail/fax attachments, generated letters). */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc?.storagePath) throw notFound("Document file");
  // Stored paths are "uploads/<name>" (UPLOAD_DIR) or "demo-…/<name>" (public/); never trust anything else.
  const name = path.basename(doc.storagePath);
  const dir = doc.storagePath.startsWith("uploads/")
    ? path.resolve(env.uploadDir)
    : path.join(process.cwd(), "public", path.dirname(doc.storagePath).replace(/[^a-z0-9-]/gi, ""));
  const bytes = await fs.readFile(path.join(dir, name)).catch(() => {
    throw notFound("Document file");
  });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": doc.mimeType === "text/plain" || !ALLOWED_UPLOAD_TYPES.has(doc.mimeType as UploadType) ? "text/plain; charset=utf-8" : doc.mimeType,
      "content-disposition": `inline; filename="${doc.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      "cache-control": "private, max-age=300",
    },
  });
});
