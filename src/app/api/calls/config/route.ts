import { json, withErrorHandling } from "@/lib/api";
import { env } from "@/lib/env";
import { getTelephony } from "@/lib/services/telephony";
import { listAgents } from "@/lib/voice/agents/registry";
import { gatewayBase } from "@/lib/voice/gateway-url";

export const dynamic = "force-dynamic";

/** What the Call Center page needs to know about this deployment. */
export const GET = withErrorHandling(async (req: Request) => {
  return json({
    hotlineNumber: env.twilioPhoneNumber || null,
    telephonyConfigured: getTelephony().configured,
    voiceConfigured: Boolean(env.xaiApiKey),
    monitorUrl: `${gatewayBase(req)}/ws/monitor`,
    transferTargets: {
      doctor: Boolean(env.onCallDoctorNumber),
      caseManager: Boolean(env.caseManagerNumber),
    },
    agents: listAgents().map((a) => ({
      id: a.id,
      label: a.label,
      description: a.description,
      direction: a.direction,
      channels: a.channels,
    })),
  });
});
