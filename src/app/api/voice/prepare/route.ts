import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { badRequest, notFound } from "@/lib/errors";
import { demoTrack, trackAgents } from "@/lib/voice/demo-runs";
import { PREPARABLE_AGENTS, prepareScenarios } from "@/lib/voice/demo-scenarios";

export const dynamic = "force-dynamic";

const Body = z.object({
  agentId: z.string().max(60).optional(),
  agentIds: z.array(z.string().max(60)).max(20).optional(),
  /** A demo run: every case-calling step's agent is prepared. */
  track: z.string().max(40).optional(),
});

/**
 * "Make it ready": puts the pinned demo case (or record) of one agent, several,
 * or a whole demo run back into the state the agent needs, and returns each
 * agent's readiness afterwards.
 */
export const POST = withErrorHandling(async (req: Request) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  let ids: string[];
  if (body.track) {
    const track = demoTrack(body.track);
    if (!track) throw notFound("Demo run");
    ids = trackAgents(track).filter((id) => PREPARABLE_AGENTS.includes(id));
  } else {
    ids = body.agentIds ?? (body.agentId ? [body.agentId] : []);
  }
  if (!ids.length) throw badRequest("Say which agent, agents or demo run to prepare.");
  const prepared = await prepareScenarios(ids, await getOperator(req));
  return json({ prepared });
});
