import fs from "node:fs/promises";
import path from "node:path";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { badRequest } from "@/lib/errors";
import { processDocument } from "@/lib/services/document-extraction";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["application/pdf", "text/plain"]);

export const GET = withErrorHandling(async () => {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { extraction: true, patient: true },
  });
  return json({ documents: serialize(documents) });
});

/**
 * Upload a medical document (multipart form, field "file") and run the full
 * processing pipeline. Returns the processed document with its extraction.
 */
export const POST = withErrorHandling(async (req: Request) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Expected a multipart form upload with a \"file\" field.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw badRequest("Please choose a PDF document to upload.");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw badRequest("Only PDF and plain-text documents are accepted in this demo.");
  }
  if (file.size > env.maxUploadBytes) {
    throw badRequest(
      `The file is too large. Maximum size is ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB.`
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Store the upload on disk (a Docker volume in production).
  const uploadDir = path.resolve(env.uploadDir);
  await fs.mkdir(uploadDir, { recursive: true });
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await fs.writeFile(path.join(uploadDir, safeName), buffer);

  const doc = await prisma.document.create({
    data: {
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      status: "UPLOADED",
      storagePath: `uploads/${safeName}`,
    },
  });

  try {
    const processed = await processDocument(doc.id, buffer);
    return json({ document: serialize(processed) }, { status: 201 });
  } catch (err) {
    const failed = await prisma.document.findUnique({
      where: { id: doc.id },
      include: { extraction: true },
    });
    return json(
      {
        document: serialize(failed),
        error: {
          code: "PROCESSING_FAILED",
          message:
            err instanceof Error
              ? err.message
              : "The document could not be processed.",
        },
      },
      { status: 422 }
    );
  }
});
