import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { badRequest, unauthorized } from "@/lib/errors";
import { askInThread } from "@/lib/services/assistant-history";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Please type a question.")
    .max(1000, "The question is too long (max 1000 characters)."),
  /** The conversation to continue; a new one starts without it. */
  threadId: z.string().max(40).nullish(),
});

/** Asks the assistant and keeps the question and answer in the operator's conversation. */
export const POST = withErrorHandling(async (req: Request) => {
  const body = bodySchema.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON body { question }.");
    })
  );
  const operator = await getOperator(req);
  if (!operator) throw unauthorized();
  const { thread, messages } = await askInThread({ operator, question: body.question, threadId: body.threadId });
  const answer = messages[1];
  return json({ thread, messages, answer: answer.text, sources: answer.sources, aiSource: answer.aiSource ?? undefined });
});
