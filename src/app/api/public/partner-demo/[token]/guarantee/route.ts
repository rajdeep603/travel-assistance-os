import { prisma } from "@/lib/db";
import { json, withErrorHandling } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { receiveSample } from "@/lib/intake/simulate";
import { logPortalEvent, requireViewer } from "@/lib/partner-demo/portal";
import { guaranteeRun, kitRecords } from "@/lib/partner-demo/views";

export const dynamic = "force-dynamic";

const SAMPLE = "benefit-cost-estimate-antalya";
const RUNS_PER_HOUR = 12;

/** The guarantee scenario's latest run, once this portal has run it (each portal starts on the button). */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const { portal } = await requireViewer(req, params.token);
  const ran = await prisma.demoPortalEvent.count({ where: { portalId: portal.id, type: "GOP_RUN" } });
  return json({ run: ran ? await guaranteeRun(await kitRecords(portal.kit)) : null });
});

/**
 * Runs the guarantee scenario: the hospital's Turkish cost estimate arrives by
 * e-mail and goes through the real intake pipeline (read, matched to the case,
 * bill review, the guarantee rules, the letter and its PDF). A new run
 * replaces the previous one. No voice minutes; the bundled sample is read offline.
 */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const { portal, viewer } = await requireViewer(req, params.token);
  const recent = await prisma.demoPortalEvent.count({ where: { portalId: portal.id, type: "GOP_RUN", createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= RUNS_PER_HOUR) throw new ApiError("That's enough runs for this hour. The last result is still shown.", 429, "TOO_MANY_RUNS");
  const records = await kitRecords(portal.kit);
  await receiveSample("email", SAMPLE);
  const run = await guaranteeRun(records);
  await logPortalEvent(portal.id, "GOP_RUN", viewer.email, { letter: run?.letter.ref ?? null, status: run?.letter.status ?? null });
  return json({ run }, { status: 201 });
});
