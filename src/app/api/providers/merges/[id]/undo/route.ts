import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { undoMerge } from "@/lib/services/provider-network";

export const dynamic = "force-dynamic";

/** Puts a merged duplicate back, with the appointments and letters that moved. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const operator = (await getOperator(req)) ?? "operator";
  return json({ merge: serialize(await undoMerge(params.id, operator)) });
});
