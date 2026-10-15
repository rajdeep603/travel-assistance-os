import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { sendLetter } from "@/lib/services/guarantee-letter";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const letter = await sendLetter(params.id, (await getOperator(req)) ?? "operator");
  return json({ letter: serialize(letter) });
});
