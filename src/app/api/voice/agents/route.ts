import { json, withErrorHandling } from "@/lib/api";
import { SCENARIO_GROUPS, voiceScenarios } from "@/lib/voice/demo-scenarios";
import { VOICE_LANGUAGES } from "@/lib/voice/languages";

export const dynamic = "force-dynamic";

/**
 * The voice agents a presenter can start in the browser, each with the case it
 * would call about and whether that case fits it, and the languages. With
 * `?caseId=`, every agent is judged on that case instead of its demo case.
 */
export const GET = withErrorHandling(async (req: Request) => {
  const caseId = new URL(req.url).searchParams.get("caseId");
  return json({ scenarios: await voiceScenarios({ caseId }), groups: SCENARIO_GROUPS, languages: VOICE_LANGUAGES });
});
