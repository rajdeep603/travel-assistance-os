import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

const Body = z.object({ caseRef: z.string().trim().min(3) });

/** Operator files a message on a case by hand (no or low-confidence match). */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const { caseRef } = Body.parse(await req.json().catch(() => ({})));
  const message = await prisma.inboundMessage.findUnique({ where: { id: params.id } });
  if (!message) throw notFound("Message");
  const kase = await prisma.case.findUnique({ where: { ref: caseRef.toUpperCase() } });
  if (!kase) throw notFound("Case");
  const operator = await getOperator(req);
  await prisma.document.updateMany({ where: { inboundMessageId: message.id }, data: { caseId: kase.id, patientId: kase.patientId } });
  const updated = await prisma.inboundMessage.update({
    where: { id: message.id },
    data: {
      matchedCaseId: kase.id,
      matchConfidence: 1,
      status: message.status === "REPLIED" ? "REPLIED" : "MATCHED",
      riskFlags: message.riskFlags.filter((f) => f !== "No matching case" && f !== "Low-confidence case match"),
    },
  });
  await prisma.caseEvent.create({
    data: {
      caseId: kase.id,
      type: message.channel === "EMAIL" ? "EMAIL" : "FAX",
      title: `${message.ref} filed on this case by an operator`,
      body: message.summary,
      actor: operator ? `operator:${operator}` : "operator",
    },
  });
  return json({ message: serialize(updated) });
});
