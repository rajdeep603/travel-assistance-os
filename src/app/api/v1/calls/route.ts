import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { requireApiCaller } from "@/lib/auth/api-keys";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { placeOutboundCall, ringInboundCall } from "@/lib/services/outbound-calls";
import { getAgent } from "@/lib/voice/agents/registry";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** An outbound agent (e.g. "outbound-provider-validation"), or an API-only inbound one ("inbound-debtor-line"): then the line rings the number and answers when it is picked up. */
  agent: z.string().min(1).max(60),
  /** E.164; must be approved for AI calls (POST /api/v1/approved-numbers). */
  to: z.string().min(6).max(24),
  /** Language the agent opens in (English name or ISO code); detected otherwise. */
  language: z.string().max(40).optional(),
  /** The agent's brief: who it is calling and what to find out. Required for API-only agents. */
  brief: z.record(z.string(), z.unknown()).optional(),
  /** Your own reference, returned on the call and in call.completed webhooks. */
  clientRef: z.string().max(80).optional(),
  /** For agents that call about a case: its reference (CASE-1024). */
  caseRef: z.string().max(20).optional(),
  /** Answering-machine detection (on by default). Off for calls a person is expected to answer: the detector sometimes takes a live person for a machine. */
  amd: z.boolean().optional(),
  /** Names on this call the recogniser should expect (people, providers, places), beyond those in the brief. */
  keyterms: z.array(z.string().max(60)).max(40).optional(),
});

/** POST /api/v1/calls: places an AI call; the outcome arrives as a call.completed webhook (or GET /api/v1/calls/{ref}). */
export const POST = withErrorHandling(async (req: Request) => {
  const caller = await requireApiCaller(req);
  const body = Body.parse(await req.json().catch(() => ({})));
  const profile = getAgent(body.agent);
  if (!profile || profile.internal || profile.id === "interpreter" || (profile.direction === "inbound" && !profile.apiOnly)) throw badRequest("Unknown outbound agent.");
  if (profile.apiOnly && !body.brief) throw badRequest(`${profile.label} needs a brief: who to call and what to find out.`);
  if (profile.direction === "inbound") {
    const call = await ringInboundCall({
      profileId: profile.id,
      to: body.to,
      language: body.language,
      brief: body.brief ?? null,
      clientRef: body.clientRef ?? null,
      keyterms: [...briefKeyterms(body.brief), ...(body.keyterms ?? [])].slice(0, 60),
      placedBy: `api:${caller.name}`,
    });
    return json({ call: { id: call.id, ref: call.ref, status: call.status, agent: profile.id } }, { status: 201 });
  }
  const kase = body.caseRef ? await prisma.case.findUnique({ where: { ref: body.caseRef.toUpperCase() }, select: { id: true } }) : null;
  if (body.caseRef && !kase) throw notFound("Case");
  const call = await placeOutboundCall({
    profileId: profile.id,
    caseId: kase?.id ?? null,
    to: body.to,
    language: body.language,
    brief: body.brief ?? null,
    clientRef: body.clientRef ?? null,
    placedBy: `api:${caller.name}`,
    ...(body.amd === false ? { amd: false } : {}),
    ...(briefKeyterms(body.brief).length || body.keyterms?.length ? { extraOutcome: { keyterms: [...briefKeyterms(body.brief), ...(body.keyterms ?? [])].slice(0, 60) } } : {}),
  });
  return json({ call: { id: call.id, ref: call.ref, status: call.status, agent: profile.id } }, { status: 201 });
});

/** Names and references in the brief the recogniser should expect (who is called, the case, the hospital, the insurer). */
function briefKeyterms(brief: Record<string, unknown> | undefined): string[] {
  if (!brief) return [];
  const out = new Set<string>();
  for (const key of ["calling", "case_ref", "patient_ref", "hospital", "patient", "client", "insurer"]) {
    const v = brief[key];
    if (typeof v === "string" && v.trim()) out.add(v.trim().slice(0, 60));
  }
  const cases = brief._cases;
  if (Array.isArray(cases)) {
    for (const c of cases.slice(0, 20)) {
      if (c && typeof c === "object") {
        for (const key of ["ref", "debtor", "hospital"]) {
          const v = (c as Record<string, unknown>)[key];
          if (typeof v === "string" && v.trim()) out.add(v.trim().slice(0, 60));
        }
      }
    }
  }
  return [...out].slice(0, 40);
}
