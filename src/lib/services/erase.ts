import fs from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, notFound } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Removing what a visitor brought to a meeting: their own document, or the
// message it arrived in, with everything the automation derived from it
// (extraction, bill review, replies, timeline entries, a claim it opened that
// would be left empty) and the stored file. A bundled sample received again
// replaces its previous copy the same way, letters included, so a demo
// repeated across meetings never piles records onto the seeded cases.
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

/**
 * The Letters of Guarantee drafted from these cost estimates, with their PDFs,
 * the fax or e-mail that carried them and their timeline entries. Only for a
 * sample copy being replaced: a seeded letter never hangs off one.
 */
async function removeLetters(tx: Tx, estimateDocumentIds: string[]): Promise<string[]> {
  const letters = await tx.guaranteeLetter.findMany({
    where: { estimateDocumentId: { in: estimateDocumentIds } },
    select: { id: true, ref: true, pdfDocumentId: true },
  });
  const paths: string[] = [];
  for (const letter of letters) {
    await tx.caseEvent.deleteMany({ where: { title: { contains: letter.ref } } });
    if (letter.pdfDocumentId) await tx.outboundMessage.deleteMany({ where: { attachmentDocumentId: letter.pdfDocumentId } });
    // Bill reviews that answered it keep their figures (onDelete: SetNull).
    await tx.guaranteeLetter.delete({ where: { id: letter.id } });
    if (letter.pdfDocumentId) {
      const pdf = await tx.document.findUnique({ where: { id: letter.pdfDocumentId }, select: { storagePath: true } });
      await tx.document.deleteMany({ where: { id: letter.pdfDocumentId } });
      if (pdf?.storagePath?.startsWith("uploads/")) paths.push(pdf.storagePath);
    }
  }
  return paths;
}

/** A claim this message opened and that has no documents left goes with it. */
async function removeEmptiedClaims(tx: Tx, messageRef: string, caseId: string | null): Promise<void> {
  if (!caseId) return;
  const claims = await tx.claim.findMany({ where: { caseId, documents: { none: {} } }, select: { id: true, history: true } });
  for (const claim of claims) {
    const history = Array.isArray(claim.history) ? (claim.history as { action?: unknown }[]) : [];
    const openedByIt = history.some((h) => typeof h.action === "string" && h.action.includes(messageRef));
    if (openedByIt) await tx.claim.delete({ where: { id: claim.id } });
  }
}

export async function deleteInboundMessage(id: string, opts: { replacingSample?: boolean } = {}): Promise<void> {
  const files = await prisma.$transaction(async (tx) => {
    const message = await tx.inboundMessage.findUnique({
      where: { id },
      select: { ref: true, matchedCaseId: true, documents: { select: { id: true } } },
    });
    if (!message) throw notFound("Message");
    const documentIds = message.documents.map((d) => d.id);
    await tx.caseEvent.deleteMany({
      where: { OR: [{ data: { path: ["messageRef"], equals: message.ref } }, { title: { contains: `enquiry ${message.ref}` } }] },
    });
    await tx.outboundMessage.deleteMany({ where: { inReplyToId: id } });
    const stored = opts.replacingSample ? await removeLetters(tx, documentIds) : [];
    stored.push(...(await removeDocuments(tx, documentIds)));
    await tx.inboundMessage.delete({ where: { id } });
    await removeEmptiedClaims(tx, message.ref, message.matchedCaseId);
    return stored;
  });
  await unlinkUploads(files);
}
