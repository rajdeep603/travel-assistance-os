import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { badRequest } from "@/lib/errors";
import { placeOutboundCall } from "@/lib/services/outbound-calls";
import { demoStep, rehearsalNote } from "@/lib/voice/demo-runs";

export const dynamic = "force-dynamic";

const Body = z.object({
  profile: z.string().min(1),
  caseId: z.string().optional(),
  to: z.string().min(6).max(24),
  language: z.string().max(40).optional(),
  /** Agents that call about a record rather than a case: which one (e.g. "RCV-1003"). */
  record: z.string().max(40).optional(),
  /** A demo step on a real phone: the agent is briefed on the exchange the presenter expects. */
  demo: z.object({ run: z.string().max(40), step: z.string().max(60) }).optional(),
});

/** Places an outbound AI call (operator action; allowlisted numbers only). */
export const POST = withErrorHandling(async (req: Request) => {
  const body = Body.parse(
    await req.json().catch(() => {
      throw badRequest("Expected JSON { profile, caseId, to }.");
    })
  );
  const demo = body.demo ? demoStep(body.demo.run, body.demo.step) : null;
  if (body.demo && (!demo || demo.step.agentId !== body.profile)) throw badRequest("Unknown demo step for this agent.");
  const call = await placeOutboundCall({
    profileId: body.profile,
    caseId: body.caseId,
    to: body.to,
    language: body.language,
    record: body.record,
    placedBy: await getOperator(req),
    rehearsal: demo ? rehearsalNote(demo.step) : null,
    extraOutcome: demo ? { demo: { run: demo.track.id, step: demo.step.id } } : undefined,
  });
  return json({ call: serialize({ id: call.id, ref: call.ref, status: call.status }) }, { status: 201 });
});
