import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { badRequest } from "@/lib/errors";
import { decideBillReview } from "@/lib/services/bill-review-service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  decision: z.enum(["ACCEPTED", "WAIVED"]),
  note: z.string().max(500).optional(),
});

/** A person decides on the AI's bill review: accept the recommended amount, or pay as billed. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const body = bodySchema.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON body { decision }.");
    })
  );
  const operator = (await getOperator(req)) ?? "operator";
  const review = await decideBillReview(params.id, body.decision, operator, body.note);
  return json({ review: serialize(review) });
});
