import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { badRequest } from "@/lib/errors";
import { placeValidationCall } from "@/lib/services/provider-validation";

export const dynamic = "force-dynamic";

const Body = z.object({
  to: z.string().min(6).max(24),
  language: z.string().max(40).optional(),
});

/** Ada rings the practice about this record (operator action; approved numbers only). */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { ref: string } }) => {
  const body = Body.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON { to }.");
    })
  );
  const call = await placeValidationCall({ ref: params.ref, to: body.to, language: body.language || null, placedBy: await getOperator(req) });
  return json({ call: serialize({ id: call.id, ref: call.ref, status: call.status }) }, { status: 201 });
});
