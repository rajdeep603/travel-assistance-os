import { json, withErrorHandling } from "@/lib/api";
import { SCENARIO_GROUPS, voiceScenarios } from "@/lib/voice/demo-scenarios";
import { VOICE_LANGUAGES } from "@/lib/voice/languages";

export const dynamic = "force-dynamic";

/** The voice agents a presenter can start in the browser, with their demo cases, and the languages. */
export const GET = withErrorHandling(async () => {
  return json({ scenarios: await voiceScenarios(), groups: SCENARIO_GROUPS, languages: VOICE_LANGUAGES });
});
