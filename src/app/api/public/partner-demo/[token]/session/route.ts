import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, badRequest } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { kitOf, scenarioOf } from "@/lib/partner-demo/kit";
import { MIN_SESSION_SECONDS, PORTAL_PLACED_BY, logPortalEvent, portalUsage, requireViewer } from "@/lib/partner-demo/portal";
import { kitRecords } from "@/lib/partner-demo/views";
import { getAgent } from "@/lib/voice/agents/registry";
import { gatewayBase } from "@/lib/voice/gateway-url";
import { voiceLanguage } from "@/lib/voice/languages";

export const dynamic = "force-dynamic";

const Body = z.object({
  scenario: z.string().min(1).max(30),
  script: z.string().max(30).optional(),
  language: z.string().max(40).optional(),
  /** The portal's interface language: summaries are written in it. */
  ui: z.enum(["tr", "en"]).optional(),
});

/**
 * Starts one of the portal's voice scenarios: a fixed agent with a fixed
 * brief, never anything else. Refused when the portal's voice minutes are
 * used up or too many of its sessions are running; capped at the portal's
 * session length (or what is left of the budget). The browser connects to
 * the returned gateway URL within a minute.
 */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const { portal, viewer } = await requireViewer(req, params.token);
  const kit = kitOf(portal.kit);
  const body = Body.parse(await req.json().catch(() => ({})));
  const scenario = kit ? scenarioOf(kit, body.scenario) : null;
  if (!kit || !scenario || scenario.kind !== "voice" || !scenario.agentId) throw badRequest("Unknown scenario.");
  const profile = getAgent(scenario.agentId);
  if (!profile) throw badRequest("Unknown scenario.");
  if (!env.xaiApiKey) throw new ApiError("Voice is not available on this server right now.", 503, "VOICE_NOT_CONFIGURED");

  const usage = await portalUsage(portal);
  if (usage.remainingSeconds < MIN_SESSION_SECONDS) {
    await logPortalEvent(portal.id, "SESSION_REFUSED", viewer.email, { scenario: scenario.id, reason: "budget" });
    throw new ApiError("The voice minutes for this demo are used up.", 429, "BUDGET_USED");
  }
  if (usage.active >= portal.maxConcurrent) {
    await logPortalEvent(portal.id, "SESSION_REFUSED", viewer.email, { scenario: scenario.id, reason: "busy" });
    throw new ApiError("Other sessions are running right now. Please try again in a few minutes.", 429, "BUSY");
  }

  const records = await kitRecords(portal.kit);
  const languages = scenario.languages ?? [];
  const chosen = languages.find((l) => l.name === body.language) ?? languages[0] ?? null;
  const script = scenario.scripts.find((s) => s.id === body.script) ?? scenario.scripts[0] ?? null;
  const caseId = scenario.onCase ? records.petra.caseId : null;

  let brief: Record<string, unknown> | null = null;
  let callLanguage: string | null = chosen ? (voiceLanguage(chosen.name)?.name ?? null) : null;
  if (scenario.id === "hospital" && caseId && profile.buildBrief) {
    brief = { ...(await profile.buildBrief(caseId)), reportEmail: "provizyon@demo-benefit.example" };
  } else if (scenario.id === "interpreter") {
    brief = {
      patient_language: chosen?.name ?? "German",
      clinician_language: "Turkish",
      setting: "the orthopaedics ward of Antalya Demo Akdeniz Hastanesi, Antalya",
    };
    // Two languages on one session: the recogniser detects each turn's language.
    callLanguage = null;
  }

  const maxSeconds = Math.max(MIN_SESSION_SECONDS, Math.min(portal.sessionSeconds, usage.remainingSeconds));
  const outcome = {
    portal: portal.id,
    scenario: scenario.id,
    ...(script ? { script: script.id } : {}),
    operatingFor: kit.operatingFor,
    summaryLanguage: body.ui === "en" ? "English" : "Turkish",
    maxSeconds,
    keyterms: kit.keyterms,
    ...(brief ? { brief } : {}),
  };
  const call = await withRef("call", (ref) =>
    prisma.call.create({
      data: {
        ref,
        direction: profile.direction === "outbound" ? "OUTBOUND" : "INBOUND",
        channel: "BROWSER",
        agentProfile: profile.id,
        caseId,
        placedBy: PORTAL_PLACED_BY(portal.id),
        language: callLanguage,
        outcome: outcome as Prisma.InputJsonValue,
      },
    })
  );
  await logPortalEvent(portal.id, "SESSION_STARTED", viewer.email, { scenario: scenario.id, script: script?.id ?? null, language: chosen?.name ?? null, callRef: call.ref });

  const ticket = await signToken({ kind: "browser-voice", callId: call.id, profile: profile.id }, gatewaySecret(), 60);
  return json(
    {
      call: { id: call.id, ref: call.ref },
      maxSeconds,
      url: `${gatewayBase(req)}/ws/voice?ticket=${encodeURIComponent(ticket)}`,
    },
    { status: 201 }
  );
});
