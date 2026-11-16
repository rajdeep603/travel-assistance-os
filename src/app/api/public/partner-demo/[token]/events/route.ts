import { z } from "zod";
import { withErrorHandling } from "@/lib/api";
import { logPortalEventOnce, requireViewer } from "@/lib/partner-demo/portal";

export const dynamic = "force-dynamic";

const Body = z.object({
  type: z.enum(["SECTION", "SCENARIO", "MODULE", "LANGUAGE", "DOCUMENT"]),
  value: z.string().trim().min(1).max(60),
});

/** What the viewer looked at, for the usage log (one entry per section per 20 minutes). */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const { portal, viewer } = await requireViewer(req, params.token);
  const body = Body.parse(await req.json().catch(() => ({})));
  await logPortalEventOnce(portal.id, body.type, viewer.email, { value: body.value }, 20);
  return new Response(null, { status: 204 });
});
