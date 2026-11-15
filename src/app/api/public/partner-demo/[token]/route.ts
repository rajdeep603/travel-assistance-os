import { json, withErrorHandling } from "@/lib/api";
import { env } from "@/lib/env";
import { kitOf } from "@/lib/partner-demo/kit";
import { logPortalEventOnce, portalByToken, portalState, portalUsage, viewerOf } from "@/lib/partner-demo/portal";
import { knowledge } from "@/lib/partner-demo/views";

export const dynamic = "force-dynamic";

/**
 * A partner demo portal as its link opens it: who it is for and whether it
 * is still open; once the viewer has acknowledged confidentiality, the
 * voice budget and the knowledge the agents work from too.
 */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const portal = await portalByToken(params.token);
  const state = portalState(portal);
  const kit = kitOf(portal.kit);
  const base = {
    state,
    portal: {
      kit: kit?.id ?? portal.kit,
      company: portal.company,
      contactName: portal.contactName,
      emailDomain: portal.emailDomain,
      hostContact: portal.hostContact,
      expiresAt: portal.expiresAt.toISOString(),
      minuteBudget: portal.minuteBudget,
      sessionSeconds: portal.sessionSeconds,
    },
  };
  if (state !== "open") return json({ ...base, viewer: null });
  const viewer = await viewerOf(req, portal);
  await logPortalEventOnce(portal.id, "OPENED", viewer?.email ?? null, { acknowledged: Boolean(viewer) }, 30);
  if (!viewer) return json({ ...base, viewer: null });
  return json({
    ...base,
    viewer: { name: viewer.name, company: viewer.company },
    usage: await portalUsage(portal),
    voiceAvailable: Boolean(env.xaiApiKey),
    knowledge: knowledge(),
  });
});
