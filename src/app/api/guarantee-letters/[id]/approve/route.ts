import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { approveLetter } from "@/lib/services/guarantee-letter";

export const dynamic = "force-dynamic";

const Body = z.object({ amount: z.number().positive().optional() });

export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const { amount } = Body.parse(await req.json().catch(() => ({})));
  const letter = await approveLetter(params.id, (await getOperator(req)) ?? "operator", amount);
  return json({ letter: serialize(letter) });
});
