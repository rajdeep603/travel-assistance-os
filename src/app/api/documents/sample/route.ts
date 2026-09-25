import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { processDocument } from "@/lib/services/document-extraction";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  file: z
    .string()
    .regex(/^[a-z0-9-]+\.pdf$/i, "Invalid sample document name."),
});

/** List bundled sample documents. */
export const GET = withErrorHandling(async () => {
  const dir = path.join(process.cwd(), "public", "demo-documents");
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".pdf"));
  } catch {
    files = [];
  }
  return json({ samples: files });
});

/**
 * Process one of the bundled fictional sample documents without an upload —
 * lets the demo run even on machines where file upload is awkward.
 */
export const POST = withErrorHandling(async (req: Request) => {
  const body = bodySchema.parse(await req.json().catch(() => {
    throw badRequest("Expected JSON body { file }.");
  }));

  const filePath = path.join(process.cwd(), "public", "demo-documents", body.file);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    throw notFound("Sample document");
  }

  const doc = await prisma.document.create({
    data: {
      filename: body.file,
      mimeType: "application/pdf",
      sizeBytes: buffer.length,
      status: "UPLOADED",
      storagePath: `demo-documents/${body.file}`,
    },
  });

  const processed = await processDocument(doc.id, buffer);
  return json({ document: serialize(processed) }, { status: 201 });
});
