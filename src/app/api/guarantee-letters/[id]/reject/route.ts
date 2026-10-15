import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { rejectLetter } from "@/lib/services/guarantee-letter";

export const dynamic = "force-dynamic";

const Body = z.object({ reason: z.string().trim().min(3).max(500) });

export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const { reason } = Body.parse(await req.json().catch(() => ({})));
  const letter = await rejectLetter(params.id, (await getOperator(req)) ?? "operator", reason);
  return json({ letter: serialize(letter) });
});
