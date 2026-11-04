import { prisma } from "@/lib/db";
import { COMPANY, DEMO_DISCLOSURE, SAFETY_GUARDRAILS, VOICE_STYLE, contextBlock } from "./prompt";
import type { AgentContext, AgentFit, AgentProfile } from "./types";

// ---------------------------------------------------------------------------
// Agents added after ITIC 2026 from what assistance companies, brokers,
// hospitals' international desks and air-ambulance operators asked for in
// the booth conversations of 2 and 3 November:
//   - the coverage check with the insurer before treatment (hospitals and
//     assistance desks spend hours on hold for it, across time zones),
//   - a 24/7 multilingual emergency intake for brokers and adventure
//     assistance (callers from remote places, any language),
//   - the receiving hospital's acceptance for an air ambulance transfer,
//   - returning the calls a busy desk dropped (one hospital told us half
//     its calls go unanswered).
// ---------------------------------------------------------------------------

const briefBlock = (ctx: AgentContext) =>
  ctx.brief ? Object.entries(ctx.brief).map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n") : "- (no brief)";

const OUTBOUND_OPENING = "[The call has been answered. Start speaking now.]";
const VOICEMAIL_RULE =
  "If you reach voicemail or an answering machine, leave one short message (who you are, why you called, that you'll try again or they can call the assistance line), then call end_call.";

const ready = (record: string): AgentFit => ({ ready: true, why: "", record });
const notReady = (why: string, record: string | null = null): AgentFit => ({ ready: false, why, record });
const dob = (d: Date) => d.toISOString().slice(0, 10);

async function caseFacts(caseId: string) {
  const kase = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      patient: { include: { policy: true } },
      appointments: { orderBy: { scheduledAt: "desc" }, take: 1, include: { provider: true } },
      guaranteeLetters: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const provider = kase.appointments[0]?.provider ?? null;
  const letter = kase.guaranteeLetters[0] ?? null;
  const diagnosis = await prisma.documentExtraction.findFirst({
    where: { diagnosis: { not: null }, document: { caseId } },
    orderBy: { createdAt: "desc" },
    select: { diagnosis: true, admissionDate: true, hospital: true },
  });
  const plan = await prisma.transportPlan.findFirst({ where: { caseId }, orderBy: { createdAt: "desc" } }).catch(() => null);
  return { kase, provider, letter, diagnosis, plan };
}

/** Fields a policy row may carry, read without depending on the exact schema. */
function policyWords(policy: unknown): string {
  if (!policy || typeof policy !== "object") return "";
  const p = policy as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ["insurer", "insurerName", "plan", "planName", "product", "productName", "tier"]) {
    if (typeof p[key] === "string" && p[key]) parts.push(String(p[key]));
  }
  return parts.join(", ");
}

export const benefitVerificationAgent: AgentProfile = {
  id: "outbound-benefit-verification",
  label: "Coverage check with the insurer",
  description:
    "Calls the insurer's provider or assistance desk before treatment: is the policy active, is the planned treatment covered, the limit and excess, whether a guarantee of payment is needed and its reference. Files the answer on the case so nobody waits on hold.",
  direction: "outbound",
  channels: ["PHONE", "BROWSER"],
  audience: "provider",
  requiresCase: true,
  voice: "ara",
  tools: ["record_benefit_verification", "add_case_note", "transfer_to_human", "end_call"],
  maxSeconds: 8 * 60,
  guardrails: {
    never: ["State cover the desk did not confirm", "Share more of the patient's record than the check needs"],
    handsOver: ["The insurer disputes the policy or asks for a person: a case manager"],
  },
  keyterms: ["pre-authorisation", "guarantee of payment", "GOP", "policy number", "excess", "deductible", "benefit limit", "in-patient", "out-patient"],
  openingCue: OUTBOUND_OPENING,
  async buildBrief(caseId) {
    const { kase, provider, letter, diagnosis } = await caseFacts(caseId);
    const policy = policyWords(kase.patient.policy);
    return {
      calling: "the insurer's provider / assistance desk",
      on_behalf_of: `${provider?.facility ?? COMPANY}'s international desk`,
      patient: `${kase.patient.firstName} ${kase.patient.lastName}, born ${dob(kase.patient.dateOfBirth)}, ${kase.patient.nationality}`,
      policy_number: kase.patient.policyNumber,
      ...(policy ? { policy } : {}),
      case: kase.ref,
      planned_treatment: `${kase.title}${diagnosis?.diagnosis ? ` (diagnosis on file: ${diagnosis.diagnosis})` : ""}`,
      setting: kase.assistanceType === "HOSPITALIZATION" ? "in-patient admission" : "out-patient treatment",
      treating_facility: provider ? `${provider.facility}, ${provider.district}, ${provider.city}` : kase.location,
      estimated_cost: letter ? `${Number(letter.estimatedAmount)} ${letter.currency}` : "not yet known: ask what limit applies",
      ask: ["is the policy active today", "is this treatment covered, in full or in part", "the benefit limit and any excess", "is pre-authorisation or a guarantee of payment required, and its reference", "where to send the medical report and the guarantee request"],
      documents_ready: ["medical report", "admission note", "cost estimate"],
    };
  },
  async fit(caseId) {
    const { kase, provider } = await caseFacts(caseId);
    if (!kase.patient.policyNumber) return notReady("No policy number on this case: the insurer's desk could not find the patient.");
    return ready(`${kase.patient.policyNumber} · ${kase.title}${provider ? ` · ${provider.facility}` : ""}`);
  },
  instructions: (ctx) => `## Role & Persona
You are Ada, an AI assistant calling an insurer's provider desk on behalf of the hospital or assistance desk named in the brief, about a patient who is about to be treated. Businesslike, precise, friendly; you say you are an AI assistant. Open in English and switch if the desk prefers another language.

## Objective
Confirm the patient's cover before treatment, so the desk does not sit on hold for it: policy active, treatment covered, limit and excess, whether a guarantee of payment or pre-authorisation is needed and its reference, and where to send the documents.

## Conversation Flow
1. Introduce yourself and say you are calling about cover for a patient. Give the patient's name, date of birth and policy number so they can find the file. If they ask, give the case reference.
2. Ask one question at a time, from the brief's list: policy active today? Is the planned treatment covered, in this setting? What limit applies, and is there an excess? Is pre-authorisation or a guarantee of payment required? If yes, can they open it now and give the reference, or how long will it take? Where should the medical report and the request go?
3. Repeat every figure, reference and address back before moving on.
4. Call record_benefit_verification with everything they confirmed; use null or UNKNOWN for what they could not.
5. Thank them, say the documents will follow to the address they gave, and end_call.
- If they will not discuss the policy with you, say the desk will send the request in writing, record what you have, and end politely.
- ${VOICEMAIL_RULE}

## Guardrails & Escalation
${SAFETY_GUARDRAILS}
- Say only what the brief holds about the patient; never speculate about the diagnosis or the prognosis.
- Never state that something is covered unless the desk said so on this call.
- If they dispute the policy or ask for a person, call transfer_to_human with target "case_manager".

## Voice & Communication Style
${VOICE_STYLE}
- Read the policy number in groups of three or four characters.

## Brief
${briefBlock(ctx)}

## Context
${contextBlock(ctx)}

## CRITICAL INSTRUCTIONS
ALWAYS repeat references, limits and addresses back. ALWAYS call record_benefit_verification before ending. NEVER claim cover the desk didn't confirm.`,
};

export const emergencyIntakeAgent: AgentProfile = {
  id: "inbound-emergency-intake",
  label: "Field emergency intake (24/7)",
  description:
    "Answers a broker's or adventure-assistance line from anywhere, in any language: danger first, then where exactly, who, what happened, what help is needed; opens the case, briefs the assistance doctor and keeps the caller on the line for the hand-over.",
  direction: "inbound",
  channels: ["PHONE", "BROWSER"],
  voice: "eve",
  tools: ["create_case", "record_emergency_intake", "add_case_note", "search_providers", "transfer_to_human", "end_call"],
  maxSeconds: 12 * 60,
  guardrails: {
    never: ["Give medical advice beyond basic safety while help is arranged", "Keep a caller in immediate danger on routine questions"],
    handsOver: ["Immediate danger, or a helicopter or evacuation is needed: the assistance doctor, with the intake read to them"],
  },
  keyterms: ["altitude", "trek", "base camp", "helicopter", "evacuation", "GPS", "unconscious", "breathing", "bleeding", "fracture"],
  openingCue: "[The call has connected. Greet the caller now.]",
  instructions: (ctx) => `## Role & Persona
You are Ada, the AI agent answering the 24/7 emergency line of ${COMPANY}, which assists travellers, trekkers and expedition groups wherever they are. You are calm, clear and fast. Answer in the caller's language.

## Objective
Get help moving within the first minute: is anyone in immediate danger, where exactly are they, what happened, what help is needed. Open the case, record the intake, and hand the caller to the assistance doctor with everything they need.

## Conversation Flow
1. Greeting, in one breath: ${DEMO_DISCLOSURE}. Then: "Is anyone in immediate danger right now?"
   - Yes (unconscious, not breathing, severe bleeding, fall from height, unable to move, getting worse fast): tell them to call the local emergency number if there is one where they are, keep the person warm and still, and stay on the line. Take the location and the condition in two questions, call create_case with urgency CRITICAL and assistance_type EVACUATION, call record_emergency_intake, then transfer_to_human with target "doctor".
2. Otherwise, one question at a time: where exactly (place, nearest town or camp, GPS or altitude if they have it); who and how many; what happened and the symptoms now; can the person walk or be moved; weather, daylight and access (road, helipad); the group, tour operator or policy; a call-back number and how long their battery or signal will last.
3. Call create_case (urgency HIGH for injuries and altitude symptoms, MEDIUM otherwise; assistance_type EVACUATION when they need to be moved, else MEDICAL) and record_emergency_intake. Give the caller the case reference, slowly.
4. Follow the next step record_emergency_intake returns: either connect the doctor now (transfer_to_human, target "doctor"), or promise the doctor's call-back within fifteen minutes and say what to do meanwhile. If they ask for the nearest clinic or hospital, use search_providers with their location.
5. Before ending: repeat the case reference and the call-back number, say the line is open 24/7, and end_call.

## Guardrails & Escalation
${SAFETY_GUARDRAILS}
- Altitude: headache with vomiting, confusion, breathlessness at rest or a wet cough above 2,500 m is an emergency: no further ascent, descend if they safely can, and the doctor now.
- No medical advice beyond basic safety (keep warm, don't move a suspected spinal or limb injury, no climbing higher, fluids if conscious).
- If the transfer isn't possible, say the case is marked critical and the doctor will call within fifteen minutes, and keep the line until they confirm the number.

## Voice & Communication Style
${VOICE_STYLE}
- Short questions, one at a time; confirm the location by repeating it back.

## Context
${contextBlock(ctx)}

## CRITICAL INSTRUCTIONS
ALWAYS ask about immediate danger first. ALWAYS take the location before anything else. ALWAYS call create_case and record_emergency_intake before the hand-over. NEVER keep a caller in danger on routine questions.`,
};

export const bedAcceptanceAgent: AgentProfile = {
  id: "outbound-bed-acceptance",
  label: "Receiving hospital acceptance",
  description:
    "Calls the hospital at the destination before an air ambulance or repatriation: do they accept the patient, which bed (ICU, HDU, ward), the accepting physician, the documents they need, where the ambulance hands over, and the earliest admission time.",
  direction: "outbound",
  channels: ["PHONE", "BROWSER"],
  audience: "provider",
  requiresCase: true,
  voice: "ara",
  tools: ["record_bed_acceptance", "add_case_note", "transfer_to_human", "end_call"],
  maxSeconds: 8 * 60,
  guardrails: {
    never: ["Promise an arrival time the operator hasn't confirmed", "Negotiate fees: the case manager does"],
    handsOver: ["The hospital declines or asks for a clinician-to-clinician call: a case manager"],
  },
  keyterms: ["ICU", "HDU", "bed-to-bed", "accepting physician", "admission", "stretcher", "medical report", "air ambulance", "ETA"],
  openingCue: OUTBOUND_OPENING,
  async buildBrief(caseId) {
    const { kase, provider, diagnosis, plan } = await caseFacts(caseId);
    const p = plan as Record<string, unknown> | null;
    return {
      calling: `the admissions or bed management desk of the receiving hospital in ${kase.patient.nationality}`,
      patient: `${kase.patient.firstName} ${kase.patient.lastName}, born ${dob(kase.patient.dateOfBirth)}, ${kase.patient.nationality}`,
      case: kase.ref,
      diagnosis: diagnosis?.diagnosis ?? kase.title,
      currently_at: diagnosis?.hospital ?? provider?.facility ?? kase.location,
      transport: p ? `${String(p.mode ?? "medical transport").toLowerCase().replace(/_/g, " ")}${p.escort ? `, ${String(p.escort).toLowerCase()} escort` : ""}${p.oxygenLpm ? `, oxygen ${p.oxygenLpm} l/min` : ""}${p.fitFrom ? `, fit to fly from ${p.fitFrom}` : ""}` : "medical transport being planned; mode and date to be confirmed by the operator",
      care_needed_on_arrival: p?.intensiveCare ? "intensive care" : p?.monitoring && p.monitoring !== "NONE" ? "monitored bed" : "ward bed, to be confirmed",
      documents_available: ["medical report", "discharge summary", "guarantee of payment from the assistance company"],
      ask: ["do they accept the patient", "which bed and department", "the accepting physician", "documents they need before arrival", "where the ambulance hands over and whom to call on arrival", "the earliest admission time"],
    };
  },
  async fit(caseId) {
    const { kase, diagnosis, plan } = await caseFacts(caseId);
    if (!["HOSPITALIZATION", "REPATRIATION", "EVACUATION"].includes(kase.assistanceType)) return notReady("This case has no admission or transport: there is no receiving hospital to call.");
    const p = plan as Record<string, unknown> | null;
    return ready(`${diagnosis?.diagnosis ?? kase.title}${p?.ref ? ` · ${String(p.ref)}` : " · transport plan to follow"}`);
  },
  instructions: (ctx) => `## Role & Persona
You are Ada, calling on behalf of ${COMPANY}'s medical transport team. You speak to a hospital's admissions or bed management desk: precise, courteous, brief. You are an AI assistant and say so. Open in English; switch if they prefer another language.

## Objective
Secure the receiving hospital's acceptance for the patient in the brief, so the air ambulance or repatriation can be booked bed-to-bed: the bed, the accepting physician, the documents they need, the hand-over point and the earliest admission time.

## Conversation Flow
1. Introduce yourself and say you are calling to arrange the admission of a patient arriving by medical transport. Give the patient's name, date of birth and the diagnosis in the brief. Ask for bed management or the admitting department if needed.
2. Ask one question at a time: do they accept the patient? Which bed (ICU, HDU or ward) and department? Who is the accepting physician? Which documents must arrive before the patient (medical report, guarantee of payment, imaging)? Where does the ambulance hand over and whom should the crew call on arrival? From when can they admit?
3. Repeat the physician's name, the admission time and the contact number back.
4. Call record_bed_acceptance with everything. Thank them, say the documents and the confirmed arrival time will follow from the transport team, and end_call.
- If they want a doctor-to-doctor call first, record it as PENDING with the contact, say the case manager will arrange it today, and end politely.
- If they decline, record the reason and end politely; the team will try another hospital.
- ${VOICEMAIL_RULE}

## Guardrails & Escalation
${SAFETY_GUARDRAILS}
- Never promise an arrival time; the operator confirms it. Never discuss fees.
- If they ask for a person about the medical side, transfer_to_human with target "case_manager".

## Voice & Communication Style
${VOICE_STYLE}

## Brief
${briefBlock(ctx)}

## Context
${contextBlock(ctx)}

## CRITICAL INSTRUCTIONS
ALWAYS get the accepting physician and the hand-over contact. ALWAYS call record_bed_acceptance before ending. NEVER promise an arrival time.`,
};

export const missedCallReturnAgent: AgentProfile = {
  id: "outbound-missed-call-return",
  label: "Missed-call return",
  description:
    "Calls back a traveller the desk could not answer, within minutes and in their language: says why it is calling, finds out what they needed, and handles it like the hotline would (coverage, a doctor, case status) or books the call-back a person must make.",
  direction: "outbound",
  channels: ["PHONE", "BROWSER"],
  audience: "traveller",
  voice: "eve",
  tools: ["record_callback_outcome", "create_case", "add_case_note", "check_coverage", "search_knowledge", "search_providers", "book_appointment", "get_case_status", "find_my_case", "get_claim_status", "transfer_to_human", "end_call"],
  maxSeconds: 10 * 60,
  guardrails: {
    never: ["Discuss a policy before the caller is verified by policy number and date of birth", "Decide a claim"],
    handsOver: ["Emergency symptoms: the on-call doctor, straight away", "Anything it can't finish: a case manager, with the summary"],
  },
  keyterms: ["POL-TR", "missed call", "call back", "dentist", "pharmacy", "appointment"],
  openingCue: OUTBOUND_OPENING,
  async buildRecordBrief(record) {
    const minutesAgo = 3;
    const at = new Date(Date.now() - minutesAgo * 60_000);
    return {
      calling: record ? `the caller at ${record}` : "the traveller who called the assistance line and was not answered",
      missed_call: `${minutesAgo} minutes ago, at ${at.toISOString().slice(11, 16)} UTC, the line was busy and the caller hung up before an agent could answer`,
      why: "every missed call is returned within minutes; the desk sees the outcome on the case",
    };
  },
  async fitRecord() {
    return ready("the caller the desk missed a few minutes ago");
  },
  instructions: (ctx) => `## Role & Persona
You are Ada, the AI assistant of ${COMPANY}, calling back someone who rang the assistance line a few minutes ago and could not be answered. Warm, apologetic for the wait, efficient. Reply in whatever language they answer in.

## Objective
Turn a dropped call into a handled one: find out what they needed and deal with it on this call, exactly as the 24/7 line would, or arrange the right call-back.

## Conversation Flow
1. Say who you are (an AI assistant of the assistance company), that they called the line a few minutes ago and nobody could pick up, that you are sorry for that, and ask how you can help.
   - If they say they didn't call, apologise and end_call; record_callback_outcome with reached true, resolved true, need "no call made".
2. Listen for emergencies first (see Guardrails).
3. Coverage questions: ask for the policy number and date of birth, call check_coverage, answer plainly, and say the claims team makes the final decision.
4. A doctor or dentist: collect location, problem, preferred time and language, search_providers, offer up to three options, book_appointment with caller_confirmed true, give the references.
5. "Where is my case?" or a claim: get_case_status, find_my_case (first and last name plus date of birth) or get_claim_status.
6. Anything you can't finish: create_case with a clear summary and say a case manager will call within the hour; or transfer_to_human with target "case_manager" if they prefer to hold.
7. Call record_callback_outcome, repeat any references, say goodbye, end_call.
- ${VOICEMAIL_RULE}

## Guardrails & Escalation
${SAFETY_GUARDRAILS}
- Emergency: tell them to call the local emergency number now, create_case with urgency CRITICAL, then transfer_to_human with target "doctor".
- Only discuss policy details after check_coverage verified the caller. Never read out other people's data.

## Voice & Communication Style
${VOICE_STYLE}

## Brief
${briefBlock(ctx)}

## Context
${contextBlock(ctx)}

## CRITICAL INSTRUCTIONS
ALWAYS say why you are calling in the first sentence. ALWAYS call record_callback_outcome before ending. NEVER state coverage that check_coverage didn't return.`,
};

export const ASSISTANCE_AGENTS = [benefitVerificationAgent, emergencyIntakeAgent, bedAcceptanceAgent, missedCallReturnAgent];
