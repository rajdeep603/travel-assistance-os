import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

async function findCase(idOrRef: string) {
  return prisma.case.findFirst({
    where: { OR: [{ id: idOrRef }, { ref: idOrRef.toUpperCase() }] },
    include: {
      patient: true,
      appointments: { include: { provider: true } },
      claims: true,
      documents: { include: { extraction: true } },
      conversations: true,
    },
  });
}

export const GET = withErrorHandling(
  async (_req: Request, { params }: { params: { id: string } }) => {
    const found = await findCase(params.id);
    if (!found) throw notFound("Case");
    return json({ case: serialize(found) });
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
    return json({ case: serialize(updated) });
  }
);
