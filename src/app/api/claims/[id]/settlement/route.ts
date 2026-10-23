import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { recommendSettlement, settleClaim } from "@/lib/services/settlement";

export const dynamic = "force-dynamic";

/** What the rules recommend paying on the claim, and why. */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  return json({ settlement: serialize(await recommendSettlement(params.id)) });
});

/** A person approves the settlement: the claim is approved and the explanation of benefits issued. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const operator = (await getOperator(req)) ?? "operator";
  const result = await settleClaim(params.id, operator);
  return json(serialize(result));
});
