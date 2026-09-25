import { json, serialize, withErrorHandling } from "@/lib/api";
import { startVoiceConversation } from "@/lib/services/voice-agent";

export const dynamic = "force-dynamic";

/** Starts a new voice assistance conversation and returns the greeting. */
export const POST = withErrorHandling(async () => {
  const result = await startVoiceConversation();
  return json(serialize(result), { status: 201 });
});
