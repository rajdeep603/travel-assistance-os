import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { badRequest } from "@/lib/errors";
import { mergeProviders } from "@/lib/services/provider-network";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ keepId: z.string().min(1), removeId: z.string().min(1) });

/** Merges a duplicate provider into the record kept. */
export const POST = withErrorHandling(async (req: Request) => {
  const body = bodySchema.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON body { keepId, removeId }.");
    })
  );
  const operator = (await getOperator(req)) ?? "operator";
  const merge = await mergeProviders(body.keepId, body.removeId, operator);
  return json({ merge: serialize(merge) });
});
