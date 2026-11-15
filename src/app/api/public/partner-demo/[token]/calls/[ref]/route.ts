import { json, withErrorHandling } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { requireViewer } from "@/lib/partner-demo/portal";
import { portalCall } from "@/lib/partner-demo/views";

export const dynamic = "force-dynamic";

/** One of this portal's sessions: transcript, summary, case and what the CRM receives. */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { token: string; ref: string } }) => {
  const { portal } = await requireViewer(req, params.token);
  const call = await portalCall(portal, params.ref);
  if (!call) throw notFound("Session");
  return json({ call });
});
