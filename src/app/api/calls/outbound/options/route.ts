import { json, withErrorHandling } from "@/lib/api";
import { env } from "@/lib/env";
import { getTelephony } from "@/lib/services/telephony";
import { isAllowedNumber, listApprovedNumbers, normalizeNumber } from "@/lib/services/approved-numbers";
import { listAgents } from "@/lib/voice/agents/registry";

export const dynamic = "force-dynamic";

/**
 * What can be called for a case: the outbound agents, whether the case gives
 * each one something to call about (`fit`), suggested numbers, the allowlist,
 * and whether the browser rehearsal and the phone line are available.
 */
export const GET = withErrorHandling(async (req: Request) => {
  const caseId = new URL(req.url).searchParams.get("caseId");
  const agents = await Promise.all(
    listAgents()
      // The interpreter bridges two people; it has its own card.
      .filter((a) => a.direction === "outbound" && a.id !== "interpreter")
      .map(async (a) => {
        const suggested = caseId && a.suggestNumber ? await a.suggestNumber(caseId).catch(() => null) : null;
        const normalized = suggested ? normalizeNumber(suggested) : null;
        const fit = caseId ? (a.fit ? await a.fit(caseId).catch(() => null) : a.requiresCase ? null : { ready: false, why: "Calls about an invoice, not a case.", record: null }) : null;
        return {
          id: a.id,
          label: a.label,
          description: a.description,
          audience: a.audience ?? null,
          suggestedNumber: normalized,
          suggestedAllowed: normalized ? await isAllowedNumber(normalized) : false,
          browser: a.channels.includes("BROWSER"),
          fit,
        };
      })
  );
  const numbers = await listApprovedNumbers();
  return json({
    telephonyConfigured: getTelephony().configured && Boolean(env.publicBaseUrl),
    voiceConfigured: Boolean(env.xaiApiKey),
    allowedNumbers: numbers.map((n) => n.number),
    numbers,
    agents,
  });
});
