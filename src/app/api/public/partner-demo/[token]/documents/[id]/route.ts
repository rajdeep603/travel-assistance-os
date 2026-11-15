import fs from "node:fs/promises";
import path from "node:path";
import { withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { notFound } from "@/lib/errors";
import { logPortalEventOnce, requireViewer } from "@/lib/partner-demo/portal";
import { kitRecords } from "@/lib/partner-demo/views";

export const dynamic = "force-dynamic";

/** A PDF of the guarantee scenario (the hospital's estimate, the letter): only documents on the kit's own case. */
export const GET = withErrorHandling(async (req: Request, { params }: { params: { token: string; id: string } }) => {
  const { portal, viewer } = await requireViewer(req, params.token);
  const records = await kitRecords(portal.kit);
  const doc = await prisma.document.findFirst({ where: { id: params.id, caseId: records.petra.caseId, mimeType: "application/pdf" } });
  if (!doc?.storagePath) throw notFound("Document");
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
