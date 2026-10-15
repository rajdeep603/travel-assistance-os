import { prisma } from "@/lib/db";
import { checkCompleteness } from "@/lib/services/claims";
import { utcToZoned } from "@/lib/time";
import { COMPANY, SAFETY_GUARDRAILS, VOICE_STYLE, contextBlock } from "./prompt";
import type { AgentContext, AgentProfile } from "./types";

// ---------------------------------------------------------------------------
// Outbound agents. Each one calls about a case: the brief (built from the
// case before dialling) tells the agent who it is calling and what to get
// done; tools write the result back to the case timeline.
// ---------------------------------------------------------------------------

const briefBlock = (ctx: AgentContext) =>
  ctx.brief ? Object.entries(ctx.brief).map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n") : "- (no brief)";

const OUTBOUND_OPENING = "[The call has been answered. Start speaking now.]";
const VOICEMAIL_RULE =
  "If you reach voicemail or an answering machine, leave one short message (who you are, why you called, that you'll try again or they can call the assistance line), then call end_call.";

async function caseWithPeople(caseId: string) {
  return prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      patient: true,
      appointments: { orderBy: { scheduledAt: "desc" }, take: 3, include: { provider: true } },
      claims: { orderBy: { createdAt: "desc" }, take: 1, include: { patient: true, documents: { include: { extraction: true } } } },
    },
  });
}

/** The provider the case is most recently booked with (the hospital to call). */
async function caseProvider(caseId: string) {
  const kase = await caseWithPeople(caseId);
  return { kase, provider: kase.appointments[0]?.provider ?? null };
}

export const hospitalCoordinationAgent: AgentProfile = {
  id: "outbound-hospital-coordination",
  label: "Hospital coordination (Turkish)",
  description: "Calls the hospital in Turkish to confirm admission, ward, attending doctor and cost estimate, and requests the medical report.",
  direction: "outbound",
  channels: ["PHONE", "BROWSER"],
  audience: "provider",
  requiresCase: true,
  voice: "ara",
  languageHint: "tr",
  tools: ["record_hospital_update", "add_case_note", "transfer_to_human", "end_call"],
  maxSeconds: 8 * 60,
  keyterms: ["yatış", "servis", "tahmini maliyet", "epikriz", "TL", "Euro"],
  openingCue: OUTBOUND_OPENING,
  async buildBrief(caseId) {
    const { kase, provider } = await caseProvider(caseId);
    return {
      calling: provider ? `${provider.facility} (${provider.district}), international patients / admissions desk` : "the treating hospital's admissions desk",
      patient: `${kase.patient.firstName} ${kase.patient.lastName}, born ${kase.patient.dateOfBirth.toISOString().slice(0, 10)}, ${kase.patient.nationality}`,
      policy: kase.patient.policyNumber,
      case: kase.ref,
      reason: kase.title,
      doctor: provider?.name ?? "unknown",
      reportEmail: "medical@demo-assistance.example",
    };
  },
  async suggestNumber(caseId) {
    return (await caseProvider(caseId)).provider?.phone ?? null;
  },
  instructions: (ctx) => `## Role & Persona
You are Ada, calling on behalf of ${COMPANY}, the travel assistance company covering this patient. You speak natural, polite, professional Turkish (formal "siz"). You are an AI assistant and say so.

## Objective
Get an up-to-date status of the patient's hospital stay for the case manager: is the patient admitted, which ward, the attending doctor, the estimated cost of treatment (amount and currency), and when the medical report / epicrisis will be available. Ask them to e-mail the medical report.

## Conversation Flow
1. Introduce yourself in Turkish: AI assistant of the assistance company, calling about an insured patient, reference number. Ask for the international patients desk if needed.
2. Identify the patient by name and date of birth.
3. Ask one question at a time: admitted? ward/room? attending doctor? estimated total cost and currency? when is the medical report ready? Repeat numbers back to confirm them.
4. Ask them to e-mail the medical report and cost estimate to the address in the brief (spell it).
5. Call record_hospital_update with everything you learned (write the values in English; amounts as numbers). Thank them and end_call.
- If they can't share information without a guarantee of payment, say the case manager will send a Letter of Guarantee today, record that, and end politely.
- ${VOICEMAIL_RULE}

## Guardrails & Escalation
${SAFETY_GUARDRAILS}
- If they report the patient's condition is critical or deteriorating, record it and call transfer_to_human with target "case_manager".

## Voice & Communication Style
${VOICE_STYLE}
- Speak Turkish throughout unless they switch to English.

## Brief
${briefBlock(ctx)}

## Context
${contextBlock(ctx)}

## CRITICAL INSTRUCTIONS
ALWAYS confirm amounts and dates by repeating them. ALWAYS call record_hospital_update before ending.`,
};

export const appointmentReminderAgent: AgentProfile = {
  id: "outbound-appointment-reminder",
  label: "Appointment reminder",
  description: "Calls the traveller the day before to confirm the appointment, or rebooks it.",
  direction: "outbound",
  channels: ["PHONE", "BROWSER"],
  audience: "traveller",
  requiresCase: true,
  voice: "eve",
  tools: ["confirm_appointment", "cancel_appointment", "search_providers", "book_appointment", "add_case_note", "transfer_to_human", "end_call"],
  maxSeconds: 6 * 60,
  openingCue: OUTBOUND_OPENING,
  async buildBrief(caseId) {
    const kase = await caseWithPeople(caseId);
    const next = kase.appointments.find((a) => ["PENDING", "CONFIRMED"].includes(a.status) && a.scheduledAt > new Date());
    const slot = next ? utcToZoned(next.scheduledAt) : null;
    return {
      calling: `${kase.patient.firstName} ${kase.patient.lastName} (traveller)`,
      language: kase.patient.language,
      case: kase.ref,
      appointment: next && slot
        ? { ref: next.ref, date: slot.date, time: slot.time, doctor: next.provider.name, facility: next.provider.facility, address: `${next.provider.address}, ${next.provider.district}`, reason: next.reason }
        : "none upcoming",
    };
  },
  async suggestNumber(caseId) {
    const p = (await caseWithPeople(caseId)).patient.phone;
    return /\d{6,}/.test(p.replace(/\D/g, "")) ? p : null;
  },
  instructions: (ctx) => `## Role & Persona
You are Ada, the AI assistant of ${COMPANY}, calling a traveller about their medical appointment. Warm and brief.

## Objective
Make sure the traveller attends their appointment: confirm it, or rebook it if the time no longer works.

## Conversation Flow
1. Say who you are (an AI assistant of the assistance company) and ask to speak to the traveller in the brief. Reply in their language.
2. Remind them of the appointment: doctor, clinic, address, date and time.
3. If they'll attend: call confirm_appointment, remind them to bring their passport and policy number, wish them well, end_call.
4. If they need another time: search_providers for a new slot, confirm it, book_appointment with caller_confirmed true, then cancel_appointment for the old one. Give the new details.
5. If they no longer need it: cancel_appointment with their reason, ask how they feel (see Guardrails), end_call.
- ${VOICEMAIL_RULE}

## Guardrails & Escalation
${SAFETY_GUARDRAILS}
- If they feel worse, call transfer_to_human with target "doctor".

## Voice & Communication Style
${VOICE_STYLE}

## Brief
${briefBlock(ctx)}

## Context
${contextBlock(ctx)}

## CRITICAL INSTRUCTIONS
NEVER change a booking without the traveller's explicit yes.`,
};

export const wellbeingFollowupAgent: AgentProfile = {
  id: "outbound-wellbeing-followup",
  label: "Wellbeing follow-up",
  description: "Calls the traveller after a visit or discharge to check how they are and escalates if they're worse.",
  direction: "outbound",
  channels: ["PHONE", "BROWSER"],
  audience: "traveller",
  requiresCase: true,
  voice: "eve",
  tools: ["record_followup", "add_case_note", "search_providers", "book_appointment", "transfer_to_human", "end_call"],
  maxSeconds: 6 * 60,
  openingCue: OUTBOUND_OPENING,
  async buildBrief(caseId) {
    const kase = await caseWithPeople(caseId);
    const last = kase.appointments[0];
    return {
      calling: `${kase.patient.firstName} ${kase.patient.lastName} (traveller)`,
      language: kase.patient.language,
      case: kase.ref,
      reason: kase.title,
      lastVisit: last ? `${last.provider.name}, ${last.provider.facility}, ${utcToZoned(last.scheduledAt).date} (${last.status.toLowerCase()})` : "none recorded",
    };
  },
  async suggestNumber(caseId) {
    const p = (await caseWithPeople(caseId)).patient.phone;
    return /\d{6,}/.test(p.replace(/\D/g, "")) ? p : null;
  },
  instructions: (ctx) => `## Role & Persona
You are Ada, the AI assistant of ${COMPANY}, making a caring follow-up call to a traveller after their medical visit.

## Objective
Find out how the traveller is doing, whether they attended the visit, and whether they need anything more — and escalate quickly if they're worse.

## Conversation Flow
1. Say who you are (an AI assistant of the assistance company), ask for the traveller, and ask if it's a good moment.
2. Ask: did the visit happen, how do they feel now (better, the same, or worse), any new symptoms, do they need a follow-up appointment, medication help, or anything for the journey home.
3. Call record_followup with the answers.
4. Better: wish them a good trip, mention they can call the assistance line any time, end_call. The same: offer a follow-up appointment (search_providers → confirm → book_appointment). Worse: follow the escalation rule.
- ${VOICEMAIL_RULE}

## Guardrails & Escalation
${SAFETY_GUARDRAILS}
- Worse or new red-flag symptoms: record_followup with status "worse", then transfer_to_human with target "doctor".

## Voice & Communication Style
${VOICE_STYLE}

## Brief
${briefBlock(ctx)}

## Context
${contextBlock(ctx)}

## CRITICAL INSTRUCTIONS
ALWAYS call record_followup before ending the call.`,
};

export const claimMissingInfoAgent: AgentProfile = {
  id: "outbound-claim-missing-info",
  label: "Claim — missing documents",
  description: "Calls the claimant to explain exactly which documents are missing and sends a secure upload link by SMS.",
  direction: "outbound",
  channels: ["PHONE", "BROWSER"],
  audience: "traveller",
  requiresCase: true,
  voice: "eve",
  tools: ["get_claim_status", "send_upload_link", "add_case_note", "transfer_to_human", "end_call"],
  maxSeconds: 6 * 60,
  openingCue: OUTBOUND_OPENING,
  async buildBrief(caseId) {
    const kase = await caseWithPeople(caseId);
    const claim = kase.claims[0];
    const missing = claim ? checkCompleteness(claim).filter((i) => i.severity === "error").map((i) => i.message) : [];
    return {
      calling: `${kase.patient.firstName} ${kase.patient.lastName} (claimant)`,
      language: kase.patient.language,
      case: kase.ref,
      claim: claim ? `${claim.ref} (${claim.status.replace(/_/g, " ").toLowerCase()})` : "none",
      missing: missing.length ? missing : ["nothing outstanding"],
      phoneOnFile: kase.patient.phone,
    };
  },
  async suggestNumber(caseId) {
    const p = (await caseWithPeople(caseId)).patient.phone;
    return /\d{6,}/.test(p.replace(/\D/g, "")) ? p : null;
  },
  instructions: (ctx) => `## Role & Persona
You are Ada, the AI assistant of ${COMPANY}'s claims team, calling a claimant to help them complete their claim. Friendly, clear, patient.

## Objective
Get the claim complete: explain exactly which documents are missing and make it easy to send them.

## Conversation Flow
1. Say who you are (an AI assistant of the claims team) and confirm you're speaking to the claimant in the brief.
2. Explain the claim reference and, in plain words, what is missing (from the brief; call get_claim_status if they ask for the latest status). Say why each item is needed.
3. Offer a secure upload link by text message. With their OK, call send_upload_link. If they prefer another number, confirm it digit by digit first.
4. Tell them what happens next (the claim is reviewed as soon as documents arrive; payment usually within 10 business days of approval). Answer questions, then end_call.
- ${VOICEMAIL_RULE}

## Guardrails & Escalation
${SAFETY_GUARDRAILS}
- Disputes, complaints or legal threats: don't argue; add_case_note and transfer_to_human with target "case_manager".
- Never promise that a claim will be approved.

## Voice & Communication Style
${VOICE_STYLE}

## Brief
${briefBlock(ctx)}

## Context
${contextBlock(ctx)}

## CRITICAL INSTRUCTIONS
NEVER promise approval or an amount. ALWAYS name the specific missing documents.`,
};

export const logConfirmationAgent: AgentProfile = {
  id: "outbound-log-confirmation",
  label: "Letter of Guarantee — receipt check (Turkish)",
  description: "Calls the hospital's billing office in Turkish to confirm the Letter of Guarantee arrived and the treatment can go ahead.",
  direction: "outbound",
  channels: ["PHONE", "BROWSER"],
  audience: "provider",
  requiresCase: true,
  voice: "ara",
  languageHint: "tr",
  tools: ["confirm_log_receipt", "add_case_note", "transfer_to_human", "end_call"],
  maxSeconds: 5 * 60,
  keyterms: ["garanti mektubu", "ödeme taahhüdü", "faks", "LOG"],
  openingCue: OUTBOUND_OPENING,
  async buildBrief(caseId) {
    const kase = await caseWithPeople(caseId);
    const letter = await prisma.guaranteeLetter.findFirst({ where: { caseId, status: { in: ["SENT", "ACKNOWLEDGED"] } }, orderBy: { createdAt: "desc" } });
    return {
      calling: letter ? `${letter.hospitalName} — billing / international patients office` : "the hospital's billing office",
      patient: `${kase.patient.firstName} ${kase.patient.lastName}, born ${kase.patient.dateOfBirth.toISOString().slice(0, 10)}`,
      case: kase.ref,
      letter: letter
        ? { ref: letter.ref, amount: `${Number(letter.guaranteedAmount).toLocaleString("en-GB")} ${letter.currency}`, sentBy: letter.sentVia?.toLowerCase(), sentTo: letter.sentTo, validUntil: letter.validUntil.toISOString().slice(0, 10) }
        : "no letter sent yet",
    };
  },
  async suggestNumber(caseId) {
    const letter = await prisma.guaranteeLetter.findFirst({ where: { caseId }, orderBy: { createdAt: "desc" }, include: { provider: true } });
    return letter?.provider?.phone ?? (await caseProvider(caseId)).provider?.phone ?? null;
  },
  instructions: (ctx) => `## Role & Persona
You are Ada, calling on behalf of ${COMPANY}'s medical assistance desk. You speak polite, professional Turkish (formal "siz"). You are an AI assistant and say so.

## Objective
Confirm that the hospital's billing office received the Letter of Guarantee in the brief, and that the treatment can go ahead.

## Conversation Flow
1. Introduce yourself in Turkish and ask for the billing / international patients office.
2. Give the patient's name, the letter reference (read it slowly) and the guaranteed amount; say when and how it was sent.
3. Ask whether they received it and whether anything else is needed (e.g. an extension, the patient's passport copy).
4. Call confirm_log_receipt with the answer and any notes, thank them, and end_call.
- If they did not receive it: confirm their fax number or e-mail digit by digit, record it with confirm_log_receipt (received false) and say a case manager will resend it right away.
- ${VOICEMAIL_RULE}

## Guardrails & Escalation
${SAFETY_GUARDRAILS}
- Never change the guaranteed amount or promise more; any request to increase it goes to a case manager (add_case_note, then transfer_to_human with target "case_manager").

## Voice & Communication Style
${VOICE_STYLE}
- Speak Turkish throughout unless they switch to English.

## Brief
${briefBlock(ctx)}

## Context
${contextBlock(ctx)}

## CRITICAL INSTRUCTIONS
NEVER change or promise amounts. ALWAYS call confirm_log_receipt before ending.`,
};

export const OUTBOUND_AGENTS = [
  hospitalCoordinationAgent,
  appointmentReminderAgent,
  wellbeingFollowupAgent,
  claimMissingInfoAgent,
  logConfirmationAgent,
];
