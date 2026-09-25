import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { analyzeRequest } from "@/lib/services/case-intake";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z
    .string()
    .trim()
    .min(10, "Please describe the assistance request (at least 10 characters).")
    .max(4000, "The request text is too long (max 4000 characters)."),
});

/** AI analysis of an incoming assistance request (no data is written). */
export const POST = withErrorHandling(async (req: Request) => {
  const body = bodySchema.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON body { text }.");
    })
  );
  const analysis = await analyzeRequest(body.text);
  return json({ analysis });
});
