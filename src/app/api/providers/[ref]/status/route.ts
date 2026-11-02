import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { badRequest, notFound } from "@/lib/errors";
import { providerByRef, setProviderStatus } from "@/lib/services/provider-validation";

export const dynamic = "force-dynamic";

const Body = z.object({
  status: z.enum(["UNVERIFIED", "VERIFIED", "CLOSED", "MOVED", "UNREACHABLE"]),
  note: z.string().trim().max(600).optional(),
});

/** The team's own verdict on a record (mark verified, closed, moved). */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { ref: string } }) => {
  const body = Body.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON { status }.");
    })
  );
  const p = await providerByRef(params.ref);
  if (!p) throw notFound("Provider");
  const updated = await setProviderStatus(p.id, body.status, await getOperator(req), body.note ?? null);
  return json({ provider: serialize({ id: updated.id, status: updated.status, lastVerifiedAt: updated.lastVerifiedAt, verificationNote: updated.verificationNote }) });
});
