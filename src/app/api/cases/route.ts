import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { createCaseFromAnalysis } from "@/lib/services/case-intake";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const cases = await prisma.case.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { patient: true, appointments: true },
  });
  return json({ cases: serialize(cases) });
});

const analysisSchema = z.object({
  patient: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  medicalIssue: z.string().nullable(),
  symptoms: z.array(z.string()),
  assistanceType: z.enum([
    "MEDICAL",
    "DENTAL",
    "HOSPITALIZATION",
    "EVACUATION",
    "REPATRIATION",
    "GENERAL",
  ]),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  requestedAction: z.string().nullable(),
  existingCaseRef: z.string().nullable(),
  summary: z.string(),
  suggestedActions: z.array(z.string()),
});

const bodySchema = z.object({
  requestText: z.string().trim().min(10).max(4000),
  analysis: analysisSchema,
  patientId: z.string().optional(),
});

/** Create a case from an accepted AI analysis. Writes a real database record. */
export const POST = withErrorHandling(async (req: Request) => {
  const body = bodySchema.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON body { requestText, analysis }.");
    })
  );
  const created = await createCaseFromAnalysis(body);
  return json({ case: serialize(created) }, { status: 201 });
});
