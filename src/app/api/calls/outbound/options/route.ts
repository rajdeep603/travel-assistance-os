import { json, withErrorHandling } from "@/lib/api";
import { env } from "@/lib/env";
import { getTelephony } from "@/lib/services/telephony";
import { isAllowedNumber, normalizeNumber } from "@/lib/services/outbound-calls";
import { listAgents } from "@/lib/voice/agents/registry";

export const dynamic = "force-dynamic";

/** What can be called for a case: outbound agents, suggested numbers, the allowlist. */
export const GET = withErrorHandling(async (req: Request) => {
  const caseId = new URL(req.url).searchParams.get("caseId");
  const agents = await Promise.all(
    listAgents()
      // The interpreter bridges two people; it has its own card.
      .filter((a) => a.direction === "outbound" && a.id !== "interpreter")
      .map(async (a) => {
        const suggested = caseId && a.suggestNumber ? await a.suggestNumber(caseId).catch(() => null) : null;
        const normalized = suggested ? normalizeNumber(suggested) : null;
        return {
          id: a.id,
          label: a.label,
          description: a.description,
          audience: a.audience ?? null,
          suggestedNumber: normalized,
          suggestedAllowed: normalized ? isAllowedNumber(normalized) : false,
        };
      })
  );
  return json({
    telephonyConfigured: getTelephony().configured && Boolean(env.publicBaseUrl),
    allowedNumbers: env.outboundAllowedNumbers,
    agents,
  });
});
