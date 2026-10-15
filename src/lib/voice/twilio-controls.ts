import { env } from "@/lib/env";
import { getTelephony, sayAndHangupTwiml, transferTwiml } from "@/lib/services/telephony";
import type { CallControls } from "./bridge";

// Live-call actions for a Twilio call: warm transfer (announce → dial →
// whisper the AI summary to whoever answers), the fallback when the AI can't
// carry on, and hangup.

const ANNOUNCEMENTS = {
  doctor: "Connecting you to the on-call doctor now. Please stay on the line.",
  case_manager: "Connecting you to a case manager now. Please stay on the line.",
};

const UNAVAILABLE = {
  connecting: "We're sorry, our assistant is unavailable right now. Connecting you to a case manager. Please stay on the line.",
  callBack:
    "We're sorry, our assistant is unavailable right now. Please call us back in a few minutes. If this is a medical emergency, hang up and call one one two.",
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
    async fallback() {
      if (!telephony.configured) return { transferredTo: null };
      const number = env.caseManagerNumber;
      if (number && env.publicBaseUrl) {
        // The same warm transfer as transfer(): whisper first, and dial-result
        // handles nobody answering.
        await telephony.redirect(
          callSid,
          transferTwiml(
            {
              number,
              announcement: UNAVAILABLE.connecting,
              whisperUrl: `${env.publicBaseUrl}/api/twilio/voice/whisper?callId=${encodeURIComponent(callId)}`,
              actionUrl: `${env.publicBaseUrl}/api/twilio/voice/dial-result?callId=${encodeURIComponent(callId)}`,
            },
            telephony.fromNumber
          )
        );
        return { transferredTo: "case_manager" as const };
      }
      await telephony.redirect(callSid, sayAndHangupTwiml(UNAVAILABLE.callBack));
      return { transferredTo: null };
    },
    async hangup() {
      if (telephony.configured) await telephony.hangup(callSid).catch(() => undefined);
    },
  };
}
