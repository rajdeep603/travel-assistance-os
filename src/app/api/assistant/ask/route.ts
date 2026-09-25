import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { askAssistant } from "@/lib/services/assistant";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Please type a question.")
    .max(1000, "The question is too long (max 1000 characters)."),
});

export const POST = withErrorHandling(async (req: Request) => {
  const body = bodySchema.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON body { question }.");
    })
  );
  const result = await askAssistant(body.question);
  return json(result);
});
