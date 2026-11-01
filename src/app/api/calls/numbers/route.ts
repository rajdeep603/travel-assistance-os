import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { badRequest } from "@/lib/errors";
import { addApprovedNumber, listApprovedNumbers, removeApprovedNumber } from "@/lib/services/approved-numbers";

export const dynamic = "force-dynamic";

/** The numbers AI agents may call: configured ones, then the ones operators added. */
export const GET = withErrorHandling(async () => {
  return json({ numbers: await listApprovedNumbers() });
});

const Body = z.object({ number: z.string().max(40), label: z.string().max(60).optional() });

/** Approves a number (with its country code) for AI calls, e.g. a prospect's own mobile. */
export const POST = withErrorHandling(async (req: Request) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  const added = await addApprovedNumber({ number: body.number, label: body.label, addedBy: await getOperator(req) });
  return json({ number: added, numbers: await listApprovedNumbers() }, { status: 201 });
});

/** Removes a number an operator added (`?id=`); configured numbers stay. */
export const DELETE = withErrorHandling(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw badRequest("Say which number to remove.");
  await removeApprovedNumber(id);
  return json({ numbers: await listApprovedNumbers() });
});
