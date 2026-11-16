import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { createSampleClaim } from "@/lib/services/sample-claim";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ caseId: z.string().optional() });

/**
 * One-click booth flow: creates a claim from the bundled fictional sample
 * pack (medical report + invoice + discharge summary) without a file picker,
 * mirroring the multipart upload route.
 */
export const POST = withErrorHandling(async (req: Request) => {
  const { caseId } = bodySchema.parse(await req.json().catch(() => ({})));
  const { claim, warnings } = await createSampleClaim({ caseId });
  return json({ claim: serialize(claim), warnings }, { status: 201 });
});
