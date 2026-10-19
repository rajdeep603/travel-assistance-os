import fs from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, notFound } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Removing what a visitor brought to a meeting: their own document, or the
// message it arrived in, with everything the automation derived from it
// (extraction, bill review, replies, timeline entries) and the stored file.
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

async function removeDocuments(tx: Tx, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const letter = await tx.guaranteeLetter.findFirst({ where: { pdfDocumentId: { in: ids } }, select: { ref: true } });
  if (letter) throw new ApiError(`This is the letter ${letter.ref}; it stays on the record.`, 409, "DOCUMENT_IN_USE");
  const docs = await tx.document.findMany({ where: { id: { in: ids } }, select: { storagePath: true } });
  await tx.guaranteeLetter.updateMany({ where: { estimateDocumentId: { in: ids } }, data: { estimateDocumentId: null } });
  await tx.outboundMessage.updateMany({ where: { attachmentDocumentId: { in: ids } }, data: { attachmentDocumentId: null } });
  // The extraction and the bill review go with the document (onDelete: Cascade).
  await tx.document.deleteMany({ where: { id: { in: ids } } });
  return docs.map((d) => d.storagePath).filter((p): p is string => Boolean(p?.startsWith("uploads/")));
}

/** Uploaded files only; bundled samples under public/ are never touched. */
async function unlinkUploads(storagePaths: string[]): Promise<void> {
  const dir = path.resolve(env.uploadDir);
  await Promise.all(storagePaths.map((p) => fs.unlink(path.join(dir, path.basename(p))).catch(() => undefined)));
}

export async function deleteDocument(id: string): Promise<void> {
  const files = await prisma.$transaction(async (tx) => {
    if (!(await tx.document.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Document");
    return removeDocuments(tx, [id]);
  });
  await unlinkUploads(files);
}

export async function deleteInboundMessage(id: string): Promise<void> {
  const files = await prisma.$transaction(async (tx) => {
    const message = await tx.inboundMessage.findUnique({ where: { id }, select: { ref: true, documents: { select: { id: true } } } });
    if (!message) throw notFound("Message");
    await tx.caseEvent.deleteMany({
      where: { OR: [{ data: { path: ["messageRef"], equals: message.ref } }, { title: { contains: `enquiry ${message.ref}` } }] },
    });
    await tx.outboundMessage.deleteMany({ where: { inReplyToId: id } });
    const stored = await removeDocuments(tx, message.documents.map((d) => d.id));
    await tx.inboundMessage.delete({ where: { id } });
    return stored;
  });
  await unlinkUploads(files);
}
