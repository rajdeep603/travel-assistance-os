import { json, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getAgent } from "@/lib/voice/agents/registry";
import type { AgentFit } from "@/lib/voice/agents/types";
import { DEMO_TRACKS } from "@/lib/voice/demo-runs";

export const dynamic = "force-dynamic";

/**
 * The demo runs with each step resolved against the database: the case it
 * runs on and whether that case still fits the agent. Hotline and booking
 * steps need no case, so they are always ready (`fit` null).
 */
export const GET = withErrorHandling(async () => {
  const refs = [...new Set(DEMO_TRACKS.flatMap((t) => t.steps.map((s) => s.caseRef)).filter((r): r is string => Boolean(r)))];
  const cases = await prisma.case.findMany({ where: { ref: { in: refs } }, select: { id: true, ref: true } });
  const byRef = new Map(cases.map((c) => [c.ref, c]));
  // Two tracks sharing a step share its check.
  const fits = new Map<string, AgentFit | null>();
  const tracks = [];
  for (const t of DEMO_TRACKS) {
    const steps = [];
    for (const s of t.steps) {
      const profile = getAgent(s.agentId);
      const kase = s.caseRef ? (byRef.get(s.caseRef) ?? null) : null;
      const key = `${s.agentId}:${kase?.id ?? s.record ?? ""}`;
      let fit = fits.get(key);
      if (fit === undefined) {
        fit = s.caseRef
          ? kase && profile?.fit
            ? await profile.fit(kase.id)
            : { ready: false, why: `${s.caseRef} isn't in this database.`, record: null }
          : s.record && profile?.fitRecord
            ? await profile.fitRecord(s.record)
            : null;
        fits.set(key, fit);
      }
      steps.push({ ...s, trackId: t.id, agentLabel: profile?.label ?? s.agentId, case: kase, fit });
    }
    tracks.push({ ...t, steps });
  }
  return json({ tracks });
});
