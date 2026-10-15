import { env } from "@/lib/env";
import { getTelephony } from "@/lib/services/telephony";
import type { CallControls } from "./bridge";

// Live-call actions for a Twilio call: warm transfer (announce → dial →
// whisper the AI summary to whoever answers) and hangup.

const ANNOUNCEMENTS = {
  doctor: "Connecting you to the on-call doctor now. Please stay on the line.",
  case_manager: "Connecting you to a case manager now. Please stay on the line.",
};

export function twilioCallControls(callId: string, callSid: string): CallControls {
  const telephony = getTelephony();
  return {
    async transfer(target) {
      const number = target === "doctor" ? env.onCallDoctorNumber : env.caseManagerNumber;
      if (!number || !telephony.configured || !env.publicBaseUrl) {
        return {
          ok: false,
          message:
            "Nobody can take a live transfer right now. Tell the caller their case is marked urgent and a member of the team will call them back within fifteen minutes.",
        };
      }
      try {
        await telephony.transfer({
          callSid,
          number,
          announcement: ANNOUNCEMENTS[target],
          whisperUrl: `${env.publicBaseUrl}/api/twilio/voice/whisper?callId=${encodeURIComponent(callId)}`,
          actionUrl: `${env.publicBaseUrl}/api/twilio/voice/dial-result?callId=${encodeURIComponent(callId)}`,
        });
        return { ok: true, message: "Transfer started." };
      } catch (err) {
        console.error(`[voice] transfer of ${callSid} failed:`, err);
        return {
          ok: false,
          message: "The transfer didn't go through. Apologise, say the case is marked urgent and a call-back is coming within fifteen minutes.",
        };
      }
    },
    async hangup() {
      if (telephony.configured) await telephony.hangup(callSid).catch(() => undefined);
    },
  };
}
