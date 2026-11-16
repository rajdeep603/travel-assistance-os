import { json, withErrorHandling } from "@/lib/api";
import { logPortalEvent, requireViewer } from "@/lib/partner-demo/portal";
import { assertRunBudget, claimRun, runClaim } from "@/lib/partner-demo/modules";

export const dynamic = "force-dynamic";

/** The claims module's latest claim, once this portal has opened one. */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const { portal } = await requireViewer(req, params.token);
  return json({ claim: await claimRun(portal.id) });
});

/** Opens a claim from the sample pack: documents read, completeness checks, bill review, the recommended settlement. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const { portal, viewer } = await requireViewer(req, params.token);
  await assertRunBudget(portal.id);
  const { view, claimId } = await runClaim(portal.id);
  await logPortalEvent(portal.id, "CLAIM_RUN", viewer.email, { claimId, ref: view.ref, status: view.status });
  return json({ claim: view }, { status: 201 });
});
