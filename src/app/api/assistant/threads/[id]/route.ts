import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { unauthorized } from "@/lib/errors";
import { deleteThread, getThread } from "@/lib/services/assistant-history";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** One conversation with every message, typed and spoken. */
export const GET = withErrorHandling(async (req: Request, { params }: Params) => {
  const operator = await getOperator(req);
  if (!operator) throw unauthorized();
  return json({ thread: await getThread(params.id, operator) });
});

export const DELETE = withErrorHandling(async (req: Request, { params }: Params) => {
  const operator = await getOperator(req);
  if (!operator) throw unauthorized();
  await deleteThread(params.id, operator);
  return json({ deleted: true });
});
