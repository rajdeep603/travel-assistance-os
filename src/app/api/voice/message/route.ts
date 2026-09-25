import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { handleVoiceUtterance } from "@/lib/services/voice-agent";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().min(1),
  utterance: z
    .string()
    .trim()
    .min(1, "Empty utterance.")
    .max(1000, "The utterance is too long."),
});

/** Sends one user utterance to the voice agent and returns its reply + state. */
export const POST = withErrorHandling(async (req: Request) => {
  const body = bodySchema.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON body { conversationId, utterance }.");
    })
  );
  const result = await handleVoiceUtterance(body.conversationId, body.utterance);
  return json(serialize(result));
});
