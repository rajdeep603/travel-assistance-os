import { LANGUAGE_NAMES, detectLanguage } from "@/lib/intake/language";
import { formatPlainDate } from "@/lib/time";
import { findCity, findDistrict, matchSymptoms, type SymptomRule } from "../nlu";
import type { ChatMessage, ConversationSummaryContext } from "../types";

// ---------------------------------------------------------------------------
// Offline call summaries for the deterministic AI provider: one to three
// sentences a case manager can take in at a glance. What the call achieved
// (the structured outcome the voice tools recorded) comes first; the
// transcript only fills in what the caller wanted. Never a list of quotes.
// ---------------------------------------------------------------------------

/** Call.outcome as the voice tools write it (src/lib/voice/tools). */
interface CallOutcome {
  caseRef?: string;
  urgency?: string;
  issue?: string;
  location?: string;
  appointmentRef?: string;
  appointment?: { date?: string; time?: string; specialty?: string; doctor?: string; reason?: string };
  handoff?: { target?: string; reason?: string };
  transferFailed?: string;
  coverageChecked?: { policy?: string; benefit?: string | null; covered?: boolean | null };
  hospitalUpdate?: {
    admitted?: boolean | null;
    ward?: string;
    attending_doctor?: string;
    estimated_cost?: number;
    currency?: string;
    report_eta?: string;
    guarantee_requested?: boolean;
  };
  followup?: { attended?: boolean | null; status?: string; new_symptoms?: string; needs?: string };
  confirmed?: string;
  cancelled?: string;
  uploadLink?: { claim?: string; sent?: boolean };
  letterReceipt?: { ref?: string; received?: boolean };
  billAgreement?: { outcome?: string; amount?: number | null; currency?: string; holdHarmless?: boolean };
  transportPlan?: { ref?: string; mode?: string };
  guaranteeEnquiry?: { hospital?: string; letters?: string[] };
  guaranteeResent?: { ref?: string; via?: string };
  topUpRequest?: { letter_ref?: string; new_estimated_total?: number; currency?: string; reason?: string };
  statusGiven?: { caseRef?: string };
  answeredBy?: string;
  endReason?: string;
}

const URGENCY: Record<string, string> = { LOW: "non-urgent", MEDIUM: "non-urgent", HIGH: "urgent" };

const PRACTITIONERS: Record<string, string> = {
  "General Medicine": "a general physician",
  Cardiology: "a cardiologist",
  Gastroenterology: "a gastroenterologist",
  Orthopedics: "an orthopaedic doctor",
  Dentistry: "a dentist",
  Dermatology: "a dermatologist",
  Neurology: "a neurologist",
  "Emergency Medicine": "an emergency physician",
  "Obstetrics & Gynecology": "an obstetrician",
  Ophthalmology: "an ophthalmologist",
  "Ear, Nose & Throat": "an ENT specialist",
  Pediatrics: "a paediatrician",
};

/** NLU symptom labels as they read mid-sentence. */
const SYMPTOMS: Record<string, string> = {
  "Loss of consciousness": "a loss of consciousness",
  "Suspected fracture / injury": "a suspected fracture or injury",
  "Fever / infection": "a fever or infection",
  "Skin reaction / allergy": "a skin reaction or allergy",
  "Headache / dizziness": "headache or dizziness",
  "Pregnancy-related concern": "a pregnancy-related concern",
  "Eye problem": "an eye problem",
  "ENT complaint": "an ear, nose or throat complaint",
};

/** Policy benefit codes (src/lib/services/policy.ts) as a question would put them. */
const BENEFITS: Record<string, string> = {
  MEDICAL_EXPENSES: "medical treatment",
  HOSPITALIZATION: "a hospital stay",
  EMERGENCY_DENTAL: "emergency dental treatment",
  MEDICAL_EVACUATION: "a medical evacuation",
  REPATRIATION: "repatriation",
  TRIP_DELAY: "a trip delay",
  BAGGAGE_DELAY: "a baggage delay",
  TRIP_CANCELLATION: "a trip cancellation",
  PRE_EXISTING_CONDITIONS: "a pre-existing condition",
};

const TRANSPORT_MODES: Record<string, string> = {
  COMMERCIAL: "a seated scheduled flight",
  COMMERCIAL_ESCORTED: "a scheduled flight with a medical escort",
  COMMERCIAL_STRETCHER: "a stretcher on a scheduled flight",
  AIR_AMBULANCE: "an air ambulance",
  NOT_FIT_TO_FLY: "not fit to fly yet",
};

const ENDINGS: Record<string, string> = {
  "voice model disconnected": "The call dropped when the voice assistant disconnected.",
  "maximum call length reached": "The call was ended at the time limit.",
  "internal error": "The call ended on a technical error.",
};

export function summarizeCall(messages: ChatMessage[], context: ConversationSummaryContext = {}): string {
  if (context.agentId === "interpreter") return interpretedCall(messages, context);
  const o = (context.outcome ?? {}) as CallOutcome;

  if (context.status === "VOICEMAIL" || o.answeredBy?.startsWith("machine")) {
    return `${context.direction === "outbound" ? `${callPurpose(context)} reached` : "Reached"} voicemail; left a short message.`;
  }

  // Outbound calls exist for their update; inbound ones for the caller's problem.
  const care = [careSentence(o, messages, context), coverageSentence(o)];
  const updates = updateSentences(o, context);
  const sentences = (context.direction === "outbound" ? [...updates, ...care] : [...care, ...updates]).filter(
    (s): s is string => Boolean(s)
  );
  if (sentences.length === 0) sentences.push(...noOutcome(messages, context));
  const ending = o.endReason ? ENDINGS[o.endReason] : undefined;
  if (ending) sentences.push(ending);
  return sentences.slice(0, 3).join(" ");
}

// --- Inbound: what was wrong and what was done about it ---------------------------

function careSentence(o: CallOutcome, messages: ChatMessage[], context: ConversationSummaryContext): string | null {
  const said = callerText(messages);
  const symptoms = matchSymptoms(said);
  const emergency =
    o.urgency === "CRITICAL" || (o.handoff?.target === "doctor" && symptoms.some((s) => s.urgency === "CRITICAL"));
  const issue = clause(o.issue) ?? clause(o.appointment?.reason) ?? symptomPhrase(symptoms);

  const actions: string[] = [];
  if (o.urgency && URGENCY[o.urgency] && !emergency) actions.push(`triaged as ${URGENCY[o.urgency]}`);
  if (emergency && messages.some((m) => m.role === "agent" && /\b112\b|one one two/i.test(m.text))) {
    actions.push("advised to call 112");
  }
  if (o.appointmentRef) actions.push(booking(o.appointment));
  if (o.handoff) actions.push(handoff(o, context.status, Boolean(issue)));
  else if (o.caseRef && !o.appointmentRef) actions.push("opened a case for case-manager follow-up");
  if (actions.length === 0) return null;

  const where = plain(o.location) ?? context.location ?? placeIn(said);
  // "chest pain in Sultanahmet" already says where.
  const place = where && issue && !issue.toLowerCase().includes(where.split(",")[0].toLowerCase()) ? ` in ${where}` : "";
  const refs = [o.appointmentRef, o.caseRef ? `case ${o.caseRef}` : null].filter(Boolean);
  const lead = issue
    ? `${emergency ? "Emergency: caller" : "Traveller"} reported ${issue}${place}; `
    : emergency
      ? "Emergency: "
      : "";
  const done = listJoin(actions);
  return `${lead}${lead ? done : capitalize(done)}${refs.length ? ` (${refs.join(", ")})` : ""}.`;
}

function booking(a: CallOutcome["appointment"]): string {
  const who = (a?.specialty && PRACTITIONERS[a.specialty]) || (a?.doctor ? `an appointment with ${a.doctor}` : "an appointment");
  const when = a?.date ? ` for ${formatPlainDate(a.date)}${a.time ? ` at ${a.time}` : ""}` : "";
  return `booked ${who}${when}`;
}

function handoff(o: CallOutcome, status: string | null | undefined, explained: boolean): string {
  const who = o.handoff?.target === "doctor" ? "the on-call doctor" : "a case manager";
  const why = !explained && o.handoff?.reason ? ` (${clause(o.handoff.reason)})` : "";
  if (o.transferFailed) return `could not reach ${who}, so an urgent call-back was flagged`;
  // Without a phone line (browser sessions) the handoff is a call-back request.
  if (!status || status === "TRANSFERRED") return `transferred to ${who}${why}`;
  return `passed to ${who} for a call-back${why}`;
}

function coverageSentence(o: CallOutcome): string | null {
  const c = o.coverageChecked;
  if (!c?.policy) return null;
  const benefit = c.benefit ? (BENEFITS[c.benefit] ?? c.benefit.toLowerCase().replace(/_/g, " ")) : null;
  if (!benefit) return `Caller asked about their cover; verified policy ${c.policy} and went through its benefits.`;
  const answer = c.covered == null ? " and explained the benefit" : ` — it is${c.covered ? "" : " not"} covered`;
  return `Caller asked whether ${benefit} is covered; verified policy ${c.policy}${answer} (claims team decides).`;
}

// --- Outbound: what the hospital or traveller told us --------------------------------

function updateSentences(o: CallOutcome, context: ConversationSummaryContext): string[] {
  const patient = context.patientName ?? null;
  const out: string[] = [];

  const h = o.hospitalUpdate;
  if (h) {
    const who = patient ?? "the patient";
    let s =
      h.admitted === true
        ? `Hospital confirmed ${who} is admitted${h.ward ? ` to ${h.ward}` : ""}${h.attending_doctor ? ` under ${h.attending_doctor}` : ""}`
        : h.admitted === false
          ? `Hospital said ${who} is not admitted`
          : `Hospital could not confirm whether ${who} is admitted`;
    const details = [
      h.estimated_cost != null
        ? `estimated cost ${Number(h.estimated_cost).toLocaleString("en-GB")}${h.currency ? ` ${h.currency}` : ""}`
        : null,
      h.report_eta ? `medical report expected ${clause(h.report_eta)}` : null,
      h.guarantee_requested ? "they asked for a Letter of Guarantee" : null,
    ].filter((d): d is string => Boolean(d));
    if (details.length) s += `; ${listJoin(details)}`;
    out.push(`${s}.`);
  }

  const f = o.followup;
  if (f?.status) {
    const attended = f.attended === true ? "attended the visit and " : f.attended === false ? "did not attend the visit and " : "";
    let s = `${patient ?? "Traveller"} ${attended}feels ${f.status === "same" ? "about the same" : f.status}`;
    if (f.new_symptoms) s += `, with new symptoms (${clause(f.new_symptoms)})`;
    if (f.needs) s += `; still needs ${clause(f.needs)}`;
    if (f.status === "worse") s += " — case escalated";
    else if (f.status === "better" && !f.needs) s += " — case resolved";
    out.push(`${s}.`);
  }

  if (o.confirmed) out.push(`${patient ?? "Traveller"} confirmed they will attend ${o.confirmed}.`);
  if (o.cancelled) out.push(`Appointment ${o.cancelled} was cancelled with ${patient ? `${patient}'s` : "the traveller's"} agreement.`);
  if (o.uploadLink?.claim) {
    out.push(
      o.uploadLink.sent
        ? `Texted ${patient ?? "the claimant"} a secure link to upload the missing documents for ${o.uploadLink.claim}.`
        : `Created an upload link for ${o.uploadLink.claim}, but the text message could not be sent — it needs to be e-mailed.`
    );
  }
  if (o.letterReceipt?.ref) {
    out.push(
      o.letterReceipt.received
        ? `Hospital confirmed it received ${o.letterReceipt.ref}.`
        : `Hospital has not received ${o.letterReceipt.ref} — it needs to be resent.`
    );
  }

  const b = o.billAgreement;
  if (b?.outcome) {
    const amount = b.amount != null ? `${Number(b.amount).toLocaleString("en-GB", { minimumFractionDigits: 2 })}${b.currency ? ` ${b.currency}` : ""}` : null;
    out.push(
      b.outcome === "AGREED"
        ? `Hospital billing agreed ${amount ?? "the reviewed amount"} as full payment${b.holdHarmless ? ", and won't bill the patient the difference" : ""}.`
        : b.outcome === "COUNTER_OFFER"
          ? `Hospital billing countered${amount ? ` at ${amount}` : ""}; a case manager decides.`
          : b.outcome === "REFUSED"
            ? "Hospital billing refused the reduction; a case manager follows up."
            : "Hospital billing will call back about the invoice."
    );
  }
  if (o.transportPlan?.ref) {
    out.push(`Treating doctor assessed ${patient ?? "the patient"} for transport home: ${TRANSPORT_MODES[o.transportPlan.mode ?? ""] ?? "plan recorded"} (${o.transportPlan.ref}).`);
  }
  if (o.guaranteeEnquiry?.letters?.length) {
    out.push(`${plain(o.guaranteeEnquiry.hospital) ?? "A hospital"} asked about ${listJoin(o.guaranteeEnquiry.letters)}; status and amount given.`);
  }
  if (o.guaranteeResent?.ref) out.push(`Re-sent ${o.guaranteeResent.ref} by ${o.guaranteeResent.via === "EMAIL" ? "e-mail" : "fax"}.`);
  if (o.topUpRequest?.letter_ref) {
    const t = o.topUpRequest;
    out.push(
      `Hospital asked to raise ${t.letter_ref} to ${Number(t.new_estimated_total ?? 0).toLocaleString("en-GB")}${t.currency ? ` ${t.currency}` : ""}${t.reason ? ` (${clause(t.reason)})` : ""}; for a case manager.`
    );
  }
  if (o.statusGiven?.caseRef) out.push(`Gave ${patient ?? "the caller"} an update on ${o.statusGiven.caseRef}.`);

  if (out.length && context.caseRef && context.direction === "outbound") {
    out[0] = `${out[0].slice(0, -1)} (case ${context.caseRef}).`;
  }
  return out;
}

function callPurpose(context: ConversationSummaryContext): string {
  const label = (context.agentLabel ?? "Outbound").replace(/\s*\([^)]*\)/g, "").trim();
  const who = context.audience === "provider" ? "the hospital" : (context.patientName ?? "the traveller");
  return `${label} call to ${who}${context.caseRef ? ` (case ${context.caseRef})` : ""}`;
}

// --- Nothing recorded: say what the caller wanted, in a sentence ------------------------

function noOutcome(messages: ChatMessage[], context: ConversationSummaryContext): string[] {
  if (context.direction === "outbound") return [`${callPurpose(context)} ended without a recorded update.`];
  const said = callerText(messages);
  const request = firstRequest(messages.filter((m) => m.role === "user").map((m) => m.text));
  if (!request) {
    return [`The ${context.channel === "BROWSER" ? "voice session" : "call"} ended before the caller stated a request.`];
  }
  const language = detectLanguage(said);
  let what: string;
  if (language !== "en") what = `spoke ${LANGUAGE_NAMES[language] ?? "another language"}`;
  else {
    const symptoms = symptomPhrase(matchSymptoms(said));
    const where = context.location ?? placeIn(said);
    what =
      requestPhrase(request, "the assistant") ??
      (symptoms ? `described ${symptoms}${where ? ` in ${where}` : ""}` : statementPhrase(request));
  }
  const first = `Caller ${what}`;
  return [/[?…]$/.test(first) ? first : `${first}.`, "Nothing was booked or escalated."];
}

// --- Interpreted calls (case manager ⇄ hospital) -----------------------------------------

function interpretedCall(messages: ChatMessage[], context: ConversationSummaryContext): string {
  // Translations are stored as "[Language] text" beside each original.
  const originals = messages.filter((m) => !TRANSLATION.test(m.text));
  const about = context.patientName ? ` about ${context.patientName}` : "";
  const ref = context.caseRef ? ` (case ${context.caseRef})` : "";
  const via = context.language ? `the live ${context.language} interpreter` : "the live interpreter";
  const turns = `${originals.length} ${originals.length === 1 ? "turn" : "turns"}`;
  const sentences = [`Case manager spoke with the hospital${about}${ref} through ${via} over ${turns}.`];
  const request = firstRequest(originals.filter((m) => m.role === "user").map((m) => m.text));
  if (request && detectLanguage(request) === "en") {
    const what = requestPhrase(request, "the hospital") ?? statementPhrase(request);
    sentences.push(/[?…]$/.test(what) ? `The case manager ${what}` : `The case manager ${what}.`);
  }
  return sentences.join(" ");
}

// --- Turning what the caller said into a clause ------------------------------------------

const TRANSLATION = /^\[[^\]]+\]\s/;

/** Openers and acknowledgements that carry no request ("Yeah, so", "Uh, hello"). */
const FILLER =
  /^(?:(?:yeah|yes|yep|yup|no|nope|ok|okay|so|and|um+|uh+|er+|erm|ah+|hm+|mm+|oh|hi|hello|hey|hiya|well|alright|all right|actually|basically|sorry|excuse me|please|good (?:morning|afternoon|evening)|thank you(?: (?:very|so) much)?|thanks(?: a lot)?)\b[\s,.!?…-]*)+/i;
const NOISE =
  /^(?:can you hear me|are you there|is (?:any|some)one there|hold on|wait|one (?:moment|second|sec)|just a (?:moment|second|sec)|pardon|what|bye|goodbye)$/i;

function tidy(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

/** The first caller line that says something, filler stripped. */
function firstRequest(lines: string[]): string | null {
  for (const line of lines) {
    if (TRANSLATION.test(line)) continue;
    const text = tidy(line).replace(FILLER, "").trim();
    const bare = text.replace(/[\s.!?…]+$/, "");
    if (bare.split(" ").length >= 2 && bare.length >= 8 && !NOISE.test(bare)) return text;
  }
  return null;
}

type Rule = [RegExp, (m: RegExpMatchArray, listener: string) => string];
const ASKS =
  "(?:i|we)(?: really| just)? (?:need|want|would like|'d like|am looking for|'m looking for|are looking for|'re looking for)";
const REQUESTS: Rule[] = [
  [new RegExp(`^${ASKS}(?: some)? (?:help|assistance) (?:with|in|for|on|about|regarding) (.+)$`, "i"), (m) => `asked for help with ${m[1]}`],
  [/^(?:(?:can|could|would|will) you (?:please )?)?help (?:me|us) (?:with|in|for|on) (.+)$/i, (m) => `asked for help with ${m[1]}`],
  [/^(?:(?:can|could|would|will) you (?:please )?)?help (?:me|us) (?:to )?(.+)$/i, (m) => `asked for help to ${m[1]}`],
  [/^(?:can|could|would|will) you (?:please )?(.+)$/i, (m, listener) => `asked ${listener} to ${m[1]}`],
  [/^(?:i|we)(?:'d| would| want to| wanted to) (?:like to )?know (.+)$/i, (m) => `asked ${m[1]}`],
  [/^(?:i|we)(?:'d| would) like to (.+)$/i, (m) => `asked to ${m[1]}`],
  [/^(?:i|we)(?:'d| would) like (.+)$/i, (m) => `asked for ${m[1]}`],
  [/^(?:i|we)(?: really| just)? (need|want) to (.+)$/i, (m) => `said they ${m[1].toLowerCase()} to ${m[2]}`],
  [new RegExp(`^${ASKS} (.+)$`, "i"), (m) => `asked for ${m[1]}`],
  [/^(is|are) (.+?) (covered|included|available|open|possible|valid)\b(.*)$/i, (m) => `asked whether ${m[2]} ${m[1].toLowerCase()} ${m[3]}${m[4]}`],
  [/^(what|how|when|where|why|who|which)\b(.*)$/i, (m) => `asked ${m[1].toLowerCase()}${m[2]}`],
];

/** "I need help in apartment booking." → "asked for help with apartment booking". */
function requestPhrase(text: string, listener: string): string | null {
  const bare = text.replace(/[\s.!?…]+$/, "");
  for (const [re, phrase] of REQUESTS) {
    const m = bare.match(re);
    if (m) return shorten(thirdPerson(phrase(m, listener)));
  }
  return null;
}

/** Anything else, reported rather than quoted. */
function statementPhrase(text: string): string {
  const bare = text.replace(/[\s.!?…]+$/, "");
  const body = shorten(thirdPerson(lowerFirst(bare)));
  return /\?\s*$/.test(text) ? `asked: ${body}?` : `said ${body}`;
}

const PRONOUNS: [RegExp, string][] = [
  [/\bI am\b/gi, "they are"],
  [/\bI was\b/gi, "they were"],
  [/\bI'm\b/gi, "they're"],
  [/\bI've\b/gi, "they've"],
  [/\bI'd\b/gi, "they'd"],
  [/\bI'll\b/gi, "they'll"],
  [/\bI\b/g, "they"],
  [/\bme\b/gi, "them"],
  [/\bmy\b/gi, "their"],
  [/\bmine\b/gi, "theirs"],
  [/\bmyself\b/gi, "themselves"],
  [/\bwe\b/gi, "they"],
  [/\bus\b/g, "them"],
  [/\bour\b/gi, "their"],
  [/\bours\b/gi, "theirs"],
];

function thirdPerson(text: string): string {
  return PRONOUNS.reduce((s, [re, to]) => s.replace(re, to), text);
}

const COMMON_START =
  /^(?:the|this|that|these|those|there|it|its|it's|a|an|some|any|my|our|we|you|he|she|they|his|her|their|do|does|did|is|are|was|were|can|could|will|would|should|have|has|just|also|but|because|if|when|what|how|where|why|who|which)\b/i;

/** Lower-cases a sentence opener ("My son…" → "my son…"), never a name. */
function lowerFirst(text: string): string {
  return COMMON_START.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function shorten(text: string, max = 110): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max);
  return `${text.slice(0, cut > 40 ? cut : max).replace(/[\s,;:]+$/, "")}…`;
}

// --- Small helpers -------------------------------------------------------------------------

function callerText(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "user" && !TRANSLATION.test(m.text))
    .map((m) => m.text)
    .join("\n");
}

/** What the caller described. "I need a doctor" alone is a request, not a symptom. */
function symptomPhrase(symptoms: SymptomRule[]): string | null {
  const specific = symptoms.filter((s) => s.symptom !== "General medical complaint").slice(0, 2);
  return specific.length ? listJoin(specific.map((s) => SYMPTOMS[s.symptom] ?? s.symptom.toLowerCase())) : null;
}

function placeIn(text: string): string | null {
  const folded = text.replace(/ı/g, "i").replace(/İ/g, "I");
  const district = findDistrict(folded);
  const city = findCity(folded);
  return district ? `${district}${city ? `, ${city}` : ""}` : city;
}

/** A model-written value, trimmed ("Sultanahmet, Istanbul."). */
function plain(text: string | null | undefined): string | null {
  return (typeof text === "string" && tidy(text).replace(/[\s.;,]+$/, "")) || null;
}

const KEEP_CASE =
  /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|dr|mr|mrs|ms|istanbul)\b/i;

/** A model-written fragment ("Severe stomach pain.") as a mid-sentence clause. */
function clause(text: string | null | undefined): string | null {
  const t = plain(text);
  if (!t) return null;
  return /^[A-Z][a-z]/.test(t) && !KEEP_CASE.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function listJoin(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
