import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { caseHandoffs, handOffCase } from "@/lib/services/network";

export const dynamic = "force-dynamic";

async function caseId(idOrRef: string) {
  const kase = await prisma.case.findFirst({ where: { OR: [{ id: idOrRef }, { ref: idOrRef.toUpperCase() }] }, select: { id: true } });
  if (!kase) throw notFound("Case");
  return kase.id;
}

/** The case's hand-offs to partners, with their updates and links. */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  return json({ handoffs: serialize(await caseHandoffs(await caseId(params.id))) });
});

const Body = z.object({ partnerId: z.string().min(1), scope: z.string().trim().min(3).max(200) });

/** Hands the case to a partner. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const body = Body.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON body { partnerId, scope }.");
    })
  );
  const operator = (await getOperator(req)) ?? "operator";
  const handoff = await handOffCase(await caseId(params.id), body.partnerId, body.scope, operator);
  return json({ handoff: serialize(handoff) }, { status: 201 });
});
