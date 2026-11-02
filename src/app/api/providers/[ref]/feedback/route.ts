import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { badRequest, notFound } from "@/lib/errors";
import { addProviderFeedback, providerByRef } from "@/lib/services/provider-validation";

export const dynamic = "force-dynamic";

const Body = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(400).optional(),
  caseRef: z.string().trim().max(20).optional(),
});

/** "How did the referral go?": a 1–5 rating that feeds the team rating. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { ref: string } }) => {
  const body = Body.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON { rating }.");
    })
  );
  const p = await providerByRef(params.ref);
  if (!p) throw notFound("Provider");
  const updated = await addProviderFeedback(p.id, { rating: body.rating, comment: body.comment ?? null, by: await getOperator(req), caseRef: body.caseRef ?? null });
  return json({ provider: serialize({ id: updated.id, internalRating: updated.internalRating }) }, { status: 201 });
});
