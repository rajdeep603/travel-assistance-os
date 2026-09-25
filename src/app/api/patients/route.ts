import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const patients = await prisma.patient.findMany({
    orderBy: { ref: "asc" },
    select: {
      id: true,
      ref: true,
      firstName: true,
      lastName: true,
      nationality: true,
      language: true,
      policyNumber: true,
    },
  });
  return json({ patients: serialize(patients) });
});
