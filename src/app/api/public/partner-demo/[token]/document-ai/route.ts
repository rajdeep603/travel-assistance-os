import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { logPortalEvent, requireViewer } from "@/lib/partner-demo/portal";
import { assertRunBudget, documentRuns, runDocumentSample } from "@/lib/partner-demo/modules";

export const dynamic = "force-dynamic";

const Body = z.object({ file: z.string().min(1).max(120) });

/** Document AI's results: the latest reading of each sample this portal ran. */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const { portal } = await requireViewer(req, params.token);
  return json({ runs: await documentRuns(portal.id) });
});

/** Reads one of the kit's sample files: OCR when scanned, the language, the fields, the English translation. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const { portal, viewer } = await requireViewer(req, params.token);
  const { file } = Body.parse(await req.json().catch(() => ({})));
  await assertRunBudget(portal.id);
  const view = await runDocumentSample(portal, file);
  await logPortalEvent(portal.id, "DOC_RUN", viewer.email, { sample: file, documentId: view.id, language: view.language, status: view.status });
  return json({ run: { ...view, sample: file } }, { status: 201 });
});
