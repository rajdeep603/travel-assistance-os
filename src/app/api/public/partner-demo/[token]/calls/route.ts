import { json, withErrorHandling } from "@/lib/api";
import { portalUsage, requireViewer } from "@/lib/partner-demo/portal";
import { portalCalls } from "@/lib/partner-demo/views";

export const dynamic = "force-dynamic";

/** This portal's sessions, newest first, with the voice time left. */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const { portal } = await requireViewer(req, params.token);
  return json({ calls: await portalCalls(portal), usage: await portalUsage(portal) });
});
