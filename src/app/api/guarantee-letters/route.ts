import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { draftFromCostEstimate } from "@/lib/services/guarantee-letter";

export const dynamic = "force-dynamic";

/** Letters of Guarantee for a case (with the cost estimates still waiting for one). */
export const GET = withErrorHandling(async (req: Request) => {
  const caseId = new URL(req.url).searchParams.get("caseId");
  if (!caseId) throw badRequest("caseId is required.");
  const [letters, estimates] = await Promise.all([
    prisma.guaranteeLetter.findMany({ where: { caseId }, orderBy: { createdAt: "desc" } }),
    prisma.document.findMany({
      where: { caseId, kind: "COST_ESTIMATE", status: "PROCESSED" },
      include: { extraction: { select: { invoiceAmount: true, currency: true, hospital: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const answered = new Set(letters.map((l) => l.estimateDocumentId));
  return json({
    letters: serialize(letters),
    pendingEstimates: serialize(estimates.filter((d) => !answered.has(d.id))),
  });
});

const Body = z.object({ documentId: z.string().min(1), caseId: z.string().min(1) });

/** Drafts a letter from a cost estimate (auto-approved and sent when nothing needs a human). */
export const POST = withErrorHandling(async (req: Request) => {
  const { documentId, caseId } = Body.parse(await req.json().catch(() => ({})));
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw notFound("Cost estimate");
  if (doc.kind !== "COST_ESTIMATE") throw badRequest("That document isn't a cost estimate.");
  const letter = await draftFromCostEstimate(documentId, caseId);
  return json({ letter: serialize(letter) }, { status: 201 });
});
