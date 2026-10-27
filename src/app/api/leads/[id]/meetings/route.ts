import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { ProposeCallSchema, callsConfigured, listCalls, proposeCall } from "@/lib/services/lead-meetings";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** The lead's Teams calls, and whether this server can book one. */
export const GET = withErrorHandling(async (_req: Request, { params }: Ctx) =>
  json({ meetings: serialize(await listCalls(params.id)), ...callsConfigured() })
);

/** Proposes a Teams call: the invite goes from the organiser's Outlook calendar. */
export const POST = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const input = ProposeCallSchema.parse(await req.json().catch(() => ({})));
  const { meeting, existing, lead } = await proposeCall(params.id, input, await getOperator(req));
  return json({ meeting: serialize(meeting), existing, lead: serialize(lead) }, { status: existing ? 200 : 201 });
});
