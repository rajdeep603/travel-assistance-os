import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { logPortalEvent, requireViewer } from "@/lib/partner-demo/portal";
import { assertRunBudget, inboxRuns, runInboxSample } from "@/lib/partner-demo/modules";
import { kitRecords } from "@/lib/partner-demo/views";

export const dynamic = "force-dynamic";

const Body = z.object({ sample: z.string().min(1).max(60) });

/** The inbox module's results: the latest copy of each sample this portal received. */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const { portal } = await requireViewer(req, params.token);
  return json({ runs: await inboxRuns(portal.id) });
});

/**
 * Receives one of the kit's sample messages (e-mail, fax or WhatsApp) through
 * the real intake pipeline: read, translated, matched to its case, filed,
 * answered when it's safe. A new run replaces the previous copy. No voice minutes.
 */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const { portal, viewer } = await requireViewer(req, params.token);
  const { sample } = Body.parse(await req.json().catch(() => ({})));
  await assertRunBudget(portal.id);
  await kitRecords(portal.kit);
  const { view, messageId } = await runInboxSample(portal, sample);
  await logPortalEvent(portal.id, "INBOX_RUN", viewer.email, { sample, messageId, ref: view.ref, status: view.status });
  return json({ run: { ...view, sample } }, { status: 201 });
});
