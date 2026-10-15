import { json, withErrorHandling } from "@/lib/api";
import { authEnabled, getOperator } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** The signed-in operator (null when sign-in is disabled), for the header. */
export const GET = withErrorHandling(async (req: Request) => {
  return json({ operator: authEnabled() ? await getOperator(req) : null });
});
