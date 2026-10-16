import fs from "node:fs/promises";
import path from "node:path";
import { withErrorHandling } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { notFound } from "@/lib/errors";
import { fileName, sampleKit } from "@/lib/samples/catalog";
import { zip } from "@/lib/zip";

export const dynamic = "force-dynamic";

/** One sample kit (fictional documents, e-mails or requests) as a .zip. */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { kit: string } }) => {
  const kit = sampleKit(params.kit);
  if (!kit) throw notFound("Sample kit");
  const publicDir = path.join(process.cwd(), "public");
  const entries = await Promise.all(
    kit.files.map(async (f) => ({
      name: fileName(f.path),
      data: await fs.readFile(path.join(publicDir, f.path)).catch(() => {
        throw notFound(`Sample file "${fileName(f.path)}"`);
      }),
    }))
  );
  const slug = BRAND.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return new Response(new Uint8Array(zip(entries)), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${slug}-samples-${kit.id}.zip"`,
      "cache-control": "private, max-age=300",
    },
  });
});
