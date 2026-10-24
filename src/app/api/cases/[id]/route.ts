import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { caseMoney } from "@/lib/services/exposure";
import { notifyFamily } from "@/lib/services/family-updates";
import { SLA_CASE_SELECT, slaInput } from "@/lib/services/service-levels";
import { caseServiceLevels } from "@/lib/sla";

export const dynamic = "force-dynamic";

async function findCase(idOrRef: string) {
  return prisma.case.findFirst({
    where: { OR: [{ id: idOrRef }, { ref: idOrRef.toUpperCase() }] },
    include: {
      patient: true,
      appointments: { include: { provider: true } },
      claims: true,
      documents: { include: { extraction: true, billReview: true } },
      conversations: true,
      calls: { orderBy: { startedAt: "desc" }, select: { id: true, ref: true, channel: true, direction: true, agentProfile: true, status: true, startedAt: true, durationSec: true, summary: true } },
      events: { orderBy: { createdAt: "asc" } },
      transportPlans: { orderBy: { createdAt: "desc" } },
    },
  });
}

export const GET = withErrorHandling(
  async (_req: Request, { params }: { params: { id: string } }) => {
    const found = await findCase(params.id);
    if (!found) throw notFound("Case");
    const [money, slaCase] = await Promise.all([
      caseMoney(found.id),
      prisma.case.findUniqueOrThrow({ where: { id: found.id }, select: SLA_CASE_SELECT }),
    ]);
    return json({ case: serialize({ ...found, money, sla: caseServiceLevels(await slaInput(slaCase)) }) });
  }
);

const patchSchema = z.object({
  status: z
    .enum(["NEW", "IN_PROGRESS", "PENDING_INFO", "ESCALATED", "RESOLVED", "CLOSED"])
    .optional(),
  assignedTo: z.string().max(120).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});

export const PATCH = withErrorHandling(
  async (req: Request, { params }: { params: { id: string } }) => {
    const body = patchSchema.parse(
      await req.json().catch(() => {
        throw badRequest("Expected a JSON body.");
      })
    );
    if (Object.keys(body).length === 0) {
      throw badRequest("Nothing to update.");
    }
    const found = await findCase(params.id);
    if (!found) throw notFound("Case");
    const updated = await prisma.case.update({
      where: { id: found.id },
      data: body,
      include: { patient: true },
    });
    const closedNow = body.status && ["RESOLVED", "CLOSED"].includes(body.status) && !["RESOLVED", "CLOSED"].includes(found.status);
    if (closedNow) await notifyFamily(found.id, "closed");
    return json({ case: serialize(updated) });
  }
);
