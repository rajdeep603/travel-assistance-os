import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { createTransportPlan } from "@/lib/services/transport-plans";

export const dynamic = "force-dynamic";

const Body = z.object({
  diagnosis: z.string().trim().min(3).max(200),
  fitToFly: z.boolean(),
  fitFrom: z.string().trim().max(60).optional(),
  mobility: z.enum(["SEATED", "WHEELCHAIR", "STRETCHER"]),
  oxygenLpm: z.number().min(0).max(15),
  monitoring: z.enum(["NONE", "BASIC", "CONTINUOUS"]),
  intensiveCare: z.boolean(),
  escort: z.enum(["NONE", "NURSE", "DOCTOR"]),
  destination: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

/** A case manager plans the transport home from the treating doctor's assessment (the AI call does the same). */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  const kase = await prisma.case.findFirst({ where: { OR: [{ id: params.id }, { ref: params.id.toUpperCase() }] }, select: { id: true } });
  if (!kase) throw notFound("Case");
  const operator = (await getOperator(req)) ?? "operator";
  const { plan, quotesFrom } = await createTransportPlan(
    kase.id,
    { ...body, fitFrom: body.fitFrom || null, destination: body.destination || null, notes: body.notes || null },
    { by: `operator:${operator}` }
  );
  return json({ plan: serialize(plan), quotesFrom }, { status: 201 });
});
