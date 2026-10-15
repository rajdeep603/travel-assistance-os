import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { acknowledgeLetter } from "@/lib/services/guarantee-status";

export const dynamic = "force-dynamic";

/** The hospital confirmed receipt (recorded by an operator). */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const letter = await acknowledgeLetter(params.id, (await getOperator(req)) ?? "operator");
  return json({ letter: serialize(letter) });
});
