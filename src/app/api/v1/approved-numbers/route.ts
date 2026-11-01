import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { requireApiCaller } from "@/lib/auth/api-keys";
import { addApprovedNumber, listApprovedNumbers } from "@/lib/services/approved-numbers";

export const dynamic = "force-dynamic";

/** GET /api/v1/approved-numbers: the numbers AI agents may call. */
export const GET = withErrorHandling(async (req: Request) => {
  await requireApiCaller(req);
  return json({ numbers: await listApprovedNumbers() });
});

const Body = z.object({ number: z.string().max(40), label: z.string().max(60).optional() });

/** POST /api/v1/approved-numbers: approves a number (with its country code) for AI calls. */
export const POST = withErrorHandling(async (req: Request) => {
  const caller = await requireApiCaller(req);
  const body = Body.parse(await req.json().catch(() => ({})));
  const added = await addApprovedNumber({ number: body.number, label: body.label, addedBy: `api:${caller.name}` });
  return json({ number: added }, { status: 201 });
});
