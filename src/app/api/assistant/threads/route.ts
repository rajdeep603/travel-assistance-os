import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { unauthorized } from "@/lib/errors";
import { createThread, listThreads } from "@/lib/services/assistant-history";

export const dynamic = "force-dynamic";

/** The operator's conversations with the assistant, latest first. */
export const GET = withErrorHandling(async (req: Request) => {
  const operator = await getOperator(req);
  if (!operator) throw unauthorized();
  return json({ threads: await listThreads(operator) });
});

/** Starts an empty conversation (voice mode needs one to save into). */
export const POST = withErrorHandling(async (req: Request) => {
  const operator = await getOperator(req);
  if (!operator) throw unauthorized();
  return json({ thread: await createThread(operator) }, { status: 201 });
});
