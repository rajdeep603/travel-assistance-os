import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { caseView } from "@/lib/api-v1/views";
import { requireApiCaller } from "@/lib/auth/api-keys";
import { prisma } from "@/lib/db";
import { analyzeRequest, createCaseFromAnalysis } from "@/lib/services/case-intake";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** What happened, as the traveller or the client's system describes it. */
  request: z.string().trim().min(10).max(5000),
  /** Links the case to an existing traveller by policy number, when known. */
  policyNumber: z.string().trim().max(40).optional(),
});

/** POST /api/v1/cases: opens a case from a request; the AI reads urgency, place and the medical issue. */
export const POST = withErrorHandling(async (req: Request) => {
  const caller = await requireApiCaller(req);
  const body = Body.parse(await req.json().catch(() => ({})));
  const patient = body.policyNumber ? await prisma.patient.findUnique({ where: { policyNumber: body.policyNumber } }) : null;
  const analysis = await analyzeRequest(body.request);
  const created = await createCaseFromAnalysis({ requestText: body.request, analysis, patientId: patient?.id });
  await prisma.caseEvent.create({
    data: { caseId: created.id, type: "NOTE", title: `Case opened through the API by ${caller.name}`, body: null, actor: `api:${caller.name}` },
  });
  return json({ case: await caseView(created.ref) }, { status: 201 });
});
