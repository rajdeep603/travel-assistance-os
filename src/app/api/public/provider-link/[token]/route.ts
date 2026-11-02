import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { priceLinkInfo, submitPriceLink } from "@/lib/services/provider-validation";

export const dynamic = "force-dynamic";

/** What the practice sees on its link: who is asking, what we have, which prices to fill in. */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { token: string } }) => {
  return json(serialize(await priceLinkInfo(params.token)));
});

const Submission = z.object({
  confirmed: z.boolean(),
  hours: z.string().max(120).optional(),
  acceptsDirectBilling: z.boolean().nullable().optional(),
  email: z.string().max(120).optional(),
  contactName: z.string().max(80).optional(),
  notes: z.string().max(600).optional(),
  currency: z.string().max(3).optional(),
  prices: z.array(z.object({ item: z.string(), amount: z.number().positive(), currency: z.string().max(3).optional() })).max(20).default([]),
});

/** The practice's answer: confirmed details, prices typed in, and/or a price list uploaded (read by the AI). */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const form = await req.formData();
  const raw = form.get("submission");
  if (typeof raw !== "string") throw badRequest("Missing submission.");
  const submission = Submission.parse(JSON.parse(raw));
  const file = form.get("file");
  let doc: { buffer: Buffer; mimeType: string; filename: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 12 * 1024 * 1024) throw badRequest("The file is larger than 12 MB.");
    doc = { buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type || "application/octet-stream", filename: file.name };
  }
  return json({ ok: true, ...(await submitPriceLink(params.token, submission, doc)) });
});
