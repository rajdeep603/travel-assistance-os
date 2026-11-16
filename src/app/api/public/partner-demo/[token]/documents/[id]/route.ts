import fs from "node:fs/promises";
import path from "node:path";
import { withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { notFound } from "@/lib/errors";
import { portalOwnsDocument } from "@/lib/partner-demo/modules";
import { logPortalEventOnce, requireViewer } from "@/lib/partner-demo/portal";
import { kitRecords } from "@/lib/partner-demo/views";

export const dynamic = "force-dynamic";

/**
 * A PDF the portal showed: the guarantee scenario's (the hospital's estimate,
 * the letter, on the kit's own case) or one that came out of this portal's
 * own inbox, Document AI or claim runs. Nothing else.
 */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { token: string; id: string } }) => {
  const { portal, viewer } = await requireViewer(req, params.token);
  const records = await kitRecords(portal.kit);
  const doc = await prisma.document.findFirst({ where: { id: params.id, mimeType: "application/pdf" } });
  if (!doc?.storagePath || !(doc.caseId === records.petra.caseId || (await portalOwnsDocument(portal.id, doc)))) throw notFound("Document");
  const name = path.basename(doc.storagePath);
  const dir = doc.storagePath.startsWith("uploads/")
    ? path.resolve(env.uploadDir)
    : path.join(process.cwd(), "public", path.dirname(doc.storagePath).replace(/[^a-z0-9-]/gi, ""));
  const bytes = await fs.readFile(path.join(dir, name)).catch(() => {
    throw notFound("Document");
  });
  await logPortalEventOnce(portal.id, "DOCUMENT", viewer.email, { value: doc.kind }, 20);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${doc.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      "cache-control": "private, max-age=300",
    },
  });
});
