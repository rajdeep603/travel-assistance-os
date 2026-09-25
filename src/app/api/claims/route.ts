import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const claims = await prisma.claim.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { patient: true, case: true, documents: true },
  });
  return json({ claims: serialize(claims) });
});
