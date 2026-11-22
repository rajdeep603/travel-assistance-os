import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { dobMatches, parseDob } from "./collections";
import { crmCall, CrmUnavailable } from "./crm-connector";
import { editDistance } from "./tpa";
import { defineTool, type ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Tools of Hero Seguros' assistance lines (the Hero Assist POC), working in
// Hero's own system through crmCall: the traveller's policy, trip, cover and
// cases stay there. A traveller is identified on three factors (the policy
// number or their CPF, the full name, the date of birth) before anything is
// said; a hospital abroad is checked against Hero's network first, then the
// patient on the same three factors. Guarantee requests, medical updates and
// invoice changes go on the case for Hero's medical team; the AI never
// commits Hero to pay.
// ---------------------------------------------------------------------------

interface Brief {
  client?: string;
  _crm_url?: string;
}

interface Identity {
  verified?: boolean;
  attempts?: number;
  member_number?: string;
  locked?: boolean;
}

interface HospitalOnCall {
  name: string;
  city?: string | null;
  caller: string;
  role?: string | null;
  callback?: string | null;
  known?: boolean;
}

interface CrmTraveller {
  number: string;
  name: string;
  dob: string;
  title?: string | null;
  address_as?: string | null;
}

async function stateOf(ctx: ToolContext): Promise<{ brief: Brief; identity: Identity; hospital: HospitalOnCall | null }> {
  const call = await prisma.call.findUnique({ where: { id: ctx.callId }, select: { outcome: true } });
  const outcome = (call?.outcome as Record<string, unknown> | null) ?? {};
  return { brief: (outcome.brief as Brief | undefined) ?? {}, identity: (outcome.identity as Identity | undefined) ?? {}, hospital: (outcome.provider as HospitalOnCall | undefined) ?? null };
}

const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  um: "1", uma: "1", dois: "2", duas: "2", tres: "3", "três": "3", quatro: "4", cinco: "5", seis: "6", meia: "6", sete: "7", oito: "8", nove: "9",
  cero: "0", uno: "1", dos: "2", cuatro: "4", siete: "7", ocho: "8", nueve: "9",
  zéro: "0", un: "1", une: "1", deux: "2", trois: "3", quatre: "4", cinq: "5", sept: "7", huit: "8", neuf: "9",
  due: "2", tre: "3", quattro: "4", cinque: "5", sei: "6", sette: "7", otto: "8",
};

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "dra", "sr", "sra", "srta", "senhor", "senhora", "dona", "seu", "senor", "senora", "don", "signor", "signora", "monsieur", "madame", "mme", "m"]);
const PARTICLES = new Set(["de", "da", "do", "dos", "das", "e", "del", "y"]);

/** Lower-case letters only, accents dropped, titles and particles out ("Sra. Ana Beatriz da Rocha" → ana, beatriz, rocha). */
export function nameWords(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s'-]/g, " ")
    .split(/[\s'-]+/)
    .filter((w) => w.length > 0 && !TITLES.has(w) && !PARTICLES.has(w));
}

const close = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && editDistance(a, b) <= (Math.max(a.length, b.length) >= 7 ? 2 : 1));

/** First name and surname must both be there ("Ana Rocha" matches "Ana Beatriz Rocha"); a phone line garbles a letter or two. */
export function fullNameMatches(given: string, record: string): boolean {
  const g = nameWords(given);
  const r = nameWords(record);
  if (g.length < 2 || r.length < 2) return false;
  if (close(g.join(""), r.join(""))) return true;
  const firstOk = close(g[0], r[0]);
  const lastOk = close(g.slice(1).join(""), r.slice(1).join("")) || close(g[g.length - 1], r[r.length - 1]);
  return firstOk && lastOk;
}

/** "HR-482-115", "H R quatro oito dois…", "318.442.706-15" → the digits. */
export function documentDigits(input: string | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ]+/)
    .map((t) => (/^\d+$/.test(t) ? t : DIGIT_WORDS[t] ?? ""))
    .join("");
}

const SYSTEM_DOWN_TRAVELLER = { error: "Hero Assist's system isn't answering just now. Apologise, take their phone number, and say a Hero Assist coordinator will call them back within 15 minutes. If it is urgent, tell them to go to the nearest emergency room or call the local emergency number, and that Hero pays the hospital once the case is opened. Say nothing about any policy or case." };
const SYSTEM_DOWN_HOSPITAL = { error: "Hero Assist's system isn't answering just now. Apologise, take the caller's name and call-back number, and say a Hero Assist coordinator will call them back within the hour. Say nothing about the patient." };

async function system<T>(ctx: ToolContext, brief: Brief, action: string, args: Record<string, unknown>, down: { error: string }): Promise<T | { error: string }> {
  try {
    return await crmCall<T>(brief._crm_url, ctx.callRef, action, args);
  } catch (err) {
    if (err instanceof CrmUnavailable) {
      console.warn(`[hero] ${ctx.callRef} ${action}: ${err.message}`);
      return down;
    }
    throw err;
  }
}

/** The three-factor check, shared by both lines. */
async function checkIdentity(ctx: ToolContext, args: { document: string; full_name: string; date_of_birth: string }, opts: { brief: Brief; identity: Identity; down: { error: string }; hospital?: HospitalOnCall | null; who: "traveller" | "patient" }) {
  const digits = documentDigits(args.document);
  const whose = opts.who === "patient" ? "the patient's" : "their";
  if (digits.length !== 6 && digits.length !== 11) return { verified: false, reason: `That isn't a full policy number or CPF. Ask again for ${whose} Hero policy number (two letters, then six digits) or ${whose} CPF (eleven digits). This did not count as an attempt.` };
  if (nameWords(args.full_name).length < 2) return { verified: false, reason: `Ask for ${whose} first name and surname. This did not count as an attempt.` };
  if (!parseDob(args.date_of_birth)) return { verified: false, reason: `Ask for ${whose} date of birth again: day, month and year. This did not count as an attempt.` };

  const res = await system<{ member: CrmTraveller | null }>(ctx, opts.brief, "find_member", { document: args.document, digits }, opts.down);
  if ("error" in res) return res;
  const member = res.member;
  const attempts = (opts.identity.attempts ?? 0) + 1;
  const checks = { number: Boolean(member), name: Boolean(member && fullNameMatches(args.full_name, member.name)), dob: Boolean(member && dobMatches(args.date_of_birth, member.dob)) };
  const verified = checks.number && checks.name && checks.dob;
  const next: Identity = verified ? { verified: true, attempts, member_number: member!.number } : { verified: false, attempts, locked: attempts >= 2 };
  await ctx.setOutcome({ identity: { ...next, checks, by: digits.length === 11 ? "cpf" : "policy" } as Prisma.InputJsonValue, identityVerified: verified });
  ctx.emit({ type: "identity", verified, attempts, ...(verified ? { memberNumber: member!.number } : {}) });
  void system(ctx, opts.brief, "identity_result", { verified, attempts, checks, member_number: verified ? member!.number : null, given_number: args.document, ...(opts.hospital ? { provider: { name: opts.hospital.name, caller: opts.hospital.caller, role: opts.hospital.role ?? null } } : {}) }, opts.down).catch(() => undefined);
  return { verified, attempts, member };
}

// ---- the traveller line ----

export const verifyTravellerTool = defineTool({
  name: "verify_traveller",
  description:
    "Check that the caller is the insured traveller, on three factors: their Hero policy number (two letters and six digits, e.g. the format HR-123-456) OR their CPF (eleven digits), their full name, and their date of birth. Call it once you have all three. Returns verified true with how to address them, or verified false with what to do. Nothing about a policy or case may be said before it returns verified true. After two failed attempts it locks.",
  schema: z.object({
    document: z.string().describe("The policy number as given (HR-123-456) or the CPF as given (eleven digits)"),
    full_name: z.string().describe("First name and surname as given"),
    date_of_birth: z.string().describe("YYYY-MM-DD, e.g. '1991-04-18'"),
  }),
  async execute(args, ctx) {
    const { brief, identity } = await stateOf(ctx);
    if (identity.verified) return { verified: true, note: "Already verified on this call." };
    if (identity.locked || (identity.attempts ?? 0) >= 2) {
      return { verified: false, locked: true, say: "Identification is locked after two attempts. Apologise, offer a call-back from a Hero Assist coordinator (take their phone number), and say nothing about any policy or case. If it is urgent, tell them to go to the nearest emergency room." };
    }
    const r = await checkIdentity(ctx, args, { brief, identity, down: SYSTEM_DOWN_TRAVELLER, who: "traveller" });
    if ("error" in r || "reason" in r) return r;
    if (r.verified) {
      return { verified: true, traveller: { policy_number: r.member!.number, name: r.member!.name, address_as: r.member!.address_as ?? null }, next: "Thank them (no name before this point), then call lookup_traveller_file before answering anything." };
    }
    // Never say which factor failed: that would help someone guess.
    return r.attempts >= 2
      ? { verified: false, locked: true, say: "The details still don't match. Apologise, say that for their privacy you can't go further on this call, and offer a call-back from a Hero Assist coordinator (take their phone number). If it is urgent, tell them to go to the nearest emergency room. Say nothing about any policy or case, and don't say which detail was wrong." }
      : { verified: false, reason: "The details don't match Hero's records. Don't say which one. Ask them to give all three again slowly: the policy number or CPF, the full name, and the date of birth." };
  },
});

async function requireTraveller(ctx: ToolContext): Promise<{ brief: Brief; memberNumber: string } | { error: string }> {
  const { brief, identity } = await stateOf(ctx);
  if (!identity.verified || !identity.member_number) return { error: "The caller isn't identified. Identify them first with verify_traveller; say nothing about any policy or case until then." };
  return { brief, memberNumber: identity.member_number };
}

export const lookupTravellerFileTool = defineTool({
  name: "lookup_traveller_file",
  description:
    "Pull up the identified traveller's file in Hero Assist: the plan and its cover (medical expenses, dental, medicines, teleconsultation, repatriation, baggage, cancellation… with limits and what's used), the trip (where they are now, the local emergency number) and their cases with status, documents received or missing, guarantees of payment, payments and reimbursements, and the next step. Answer status and cover questions only from what it returns.",
  schema: z.object({
    topic: z.enum(["status", "cover", "both"]).describe("What the traveller is asking about"),
    case_number: z.string().optional().describe("A case number they mentioned, e.g. HA-12345"),
  }),
  async execute(args, ctx) {
    const v = await requireTraveller(ctx);
    if ("error" in v) return v;
    const file = await system<Record<string, unknown>>(ctx, v.brief, "member_file", { member_number: v.memberNumber, topic: args.topic, case_number: args.case_number ?? null }, SYSTEM_DOWN_TRAVELLER);
    if ("error" in file) return file;
    ctx.emit({ type: "member_file", memberNumber: v.memberNumber, topic: args.topic });
    await ctx.setOutcome({ lookedUp: { member_number: v.memberNumber, topic: args.topic, case_number: args.case_number ?? null } });
    return file;
  },
});

export const openHeroCaseTool = defineTool({
  name: "open_hero_case",
  description:
    "Open a new Hero Assist case for the identified traveller: a new incident they are calling about (an illness, an injury, a dentist, a pharmacy, delayed or lost baggage, a reimbursement). Collect what happened, when, where (city) and whether they have been seen or paid anything first. Returns the new case number to read back, the network hospital or clinic near them if there is one, and what happens next.",
  schema: z.object({
    incident: z.string().describe("What happened, in a few English words, e.g. 'twisted right ankle on stairs, swollen'"),
    incident_date: z.string().describe("YYYY-MM-DD"),
    care_type: z.enum(["clinic_visit", "emergency_room", "hospital_admission", "teleconsultation", "pharmacy", "dental", "baggage_delay", "baggage_lost", "reimbursement", "trip_cancellation", "other"]),
    city: z.string().optional().describe("Where they are now"),
    provider: z.string().optional().describe("A clinic or hospital they already went to or are at, if any"),
    paid_out_of_pocket: z.boolean().optional().describe("Whether they already paid anything themselves"),
    amount_paid: z.number().optional(),
    currency: z.string().optional().describe("EUR, USD…"),
    callback_phone: z.string().optional(),
    notes: z.string().optional().describe("Anything else the coordinator should know, in English"),
  }),
  async execute(args, ctx) {
    const v = await requireTraveller(ctx);
    if ("error" in v) return v;
    const result = await system<{ case?: { number: string; spoken?: string }; network_near_them?: unknown[]; next_steps?: string[]; promise?: string }>(ctx, v.brief, "open_case", { member_number: v.memberNumber, ...args }, { error: "Hero Assist's system isn't answering just now. Apologise, say a coordinator opens the case and calls them back within 15 minutes, and take their phone number. If it is urgent, tell them to go to the nearest emergency room." });
    if ("error" in result) return result;
    if (!result.case?.number) return { error: "The case could not be opened. Apologise and say a Hero Assist coordinator opens it and calls them back within 15 minutes." };
    await ctx.setOutcome({ caseOpened: { member_number: v.memberNumber, case_number: result.case.number, incident: args.incident, care_type: args.care_type } as Prisma.InputJsonValue });
    ctx.emit({ type: "case_opened", memberNumber: v.memberNumber, caseNumber: result.case.number });
    return { opened: true, ...result, say: "Read the case number back slowly, as given in 'spoken', digit by digit in the call's language. Then the network place near them (if any) and the next steps, in two or three short sentences." };
  },
});

// ---- the hospital line ----

export const verifyHospitalTool = defineTool({
  name: "verify_hospital",
  description:
    "Check the calling hospital, clinic or billing office against Hero Assist's network and the providers on its cases, first thing once you have the facility's name and the caller's name. Returns known true (then ask for the patient's details), or what to do for an unknown facility.",
  schema: z.object({
    facility: z.string().describe("The hospital, clinic or office calling, as they named it"),
    caller_name: z.string().describe("The caller's name"),
    caller_role: z.string().optional().describe("e.g. admissions, billing office, international office, nurse, physician"),
    callback_number: z.string().optional().describe("A number to call them back on"),
  }),
  async execute(args, ctx) {
    const { brief, hospital } = await stateOf(ctx);
    if (hospital?.known) return { known: true, provider: { name: hospital.name }, note: "Already checked on this call. Now get the patient's Hero policy number or CPF, full name and date of birth, then verify_insured_patient." };
    const found = await system<{ provider: { name: string; city?: string | null } | null }>(ctx, brief, "find_provider", { facility: args.facility }, SYSTEM_DOWN_HOSPITAL);
    if ("error" in found) return found;
    if (!found.provider) {
      await ctx.setOutcome({ provider: { name: args.facility, known: false, caller: args.caller_name, role: args.caller_role ?? null, callback: args.callback_number ?? null } as Prisma.InputJsonValue });
      void system(ctx, brief, "identity_result", { verified: false, attempts: 0, provider_unknown: true, facility: args.facility, caller: args.caller_name }, SYSTEM_DOWN_HOSPITAL).catch(() => undefined);
      return {
        known: false,
        say: "Hero Assist can't find this facility in its network or on its cases. Say so politely, take the caller's role and the facility's main number, and say a Hero Assist coordinator will call the facility back on its listed number. Say nothing about any patient, not even whether they are insured with Hero. Then record_provider_call (provider_unknown) and end politely.",
      };
    }
    const entry: HospitalOnCall = { name: found.provider.name, city: found.provider.city ?? null, caller: args.caller_name, role: args.caller_role ?? null, callback: args.callback_number ?? null, known: true };
    await ctx.setOutcome({ provider: entry as unknown as Prisma.InputJsonValue });
    ctx.emit({ type: "provider", provider: entry.name });
    return { known: true, provider: { name: entry.name, city: entry.city }, next: "Now ask, one at a time, the patient's Hero policy number or CPF (read it back), full name and date of birth, then call verify_insured_patient." };
  },
});

export const verifyInsuredPatientTool = defineTool({
  name: "verify_insured_patient",
  description:
    "Check that the patient the hospital is calling about is insured with Hero, on three factors: the Hero policy number (two letters and six digits) or the patient's CPF (eleven digits), the full name and the date of birth. Call it once you have all three, after verify_hospital returned known true. Nothing about the patient may be said before it returns verified true. After two failed attempts it locks.",
  schema: z.object({
    document: z.string().describe("The policy number as given (HR-123-456) or the CPF (eleven digits)"),
    full_name: z.string().describe("The patient's first name and surname"),
    date_of_birth: z.string().describe("YYYY-MM-DD"),
  }),
  async execute(args, ctx) {
    const { brief, identity, hospital } = await stateOf(ctx);
    if (!hospital?.known) return { verified: false, reason: "Check the facility first with verify_hospital (its name and the caller's name)." };
    if (identity.verified) return { verified: true, note: "Already verified on this call." };
    if (identity.locked || (identity.attempts ?? 0) >= 2) {
      return { verified: false, locked: true, say: "Verification is locked after two attempts. Apologise, say a Hero Assist coordinator will call the facility back on its listed number, and say nothing about the patient." };
    }
    const r = await checkIdentity(ctx, args, { brief, identity, down: SYSTEM_DOWN_HOSPITAL, hospital, who: "patient" });
    if ("error" in r || "reason" in r) return r;
    if (r.verified) {
      return { verified: true, patient: { policy_number: r.member!.number, name: r.member!.name, title: r.member!.title === "Sra." ? "Mrs" : "Mr" }, next: "Thank them, then call lookup_patient_for_hospital for what they asked before answering." };
    }
    return r.attempts >= 2
      ? { verified: false, locked: true, say: "The patient's details still don't match. Apologise, say that for the patient's privacy you can't go further on this call, and that a Hero Assist coordinator will call the facility back on its listed number. Say nothing about the patient and don't say which detail was wrong." }
      : { verified: false, reason: "The patient's details don't match Hero's records. Don't say which one. Ask for the policy number or CPF, the full name and the date of birth again, slowly." };
  },
});

async function requireHospital(ctx: ToolContext): Promise<{ brief: Brief; memberNumber: string; hospital: HospitalOnCall } | { error: string }> {
  const { brief, identity, hospital } = await stateOf(ctx);
  if (!identity.verified || !identity.member_number || !hospital?.known) return { error: "The facility and the patient aren't verified. Use verify_hospital, then verify_insured_patient; say nothing about the patient until then." };
  return { brief, memberNumber: identity.member_number, hospital };
}

export const lookupPatientForHospitalTool = defineTool({
  name: "lookup_patient_for_hospital",
  description:
    "What the verified hospital may know about the patient: whether the travel cover is active on the date of service, the plan, the benefit for the service they name (limits, what's left on this trip), how Hero pays (only with a written guarantee of payment) and where invoices go, and this facility's own cases: guarantees of payment sent (reference, amount, date), requests pending, invoices billed and approved, payments made (date and transfer reference), documents missing. Answer only from what it returns.",
  schema: z.object({
    topic: z.enum(["eligibility", "benefits", "guarantee", "claim_status", "case"]).describe("What the hospital is asking about"),
    service: z.string().optional().describe("The service or care, in English: 'inpatient admission', 'surgery', 'emergency visit', 'MRI'"),
    date_of_service: z.string().optional().describe("YYYY-MM-DD, if they gave one"),
    case_number: z.string().optional().describe("A Hero case number (HA-…) or guarantee reference (GP-…) they quoted"),
  }),
  async execute(args, ctx) {
    const v = await requireHospital(ctx);
    if ("error" in v) return v;
    const file = await system<Record<string, unknown>>(ctx, v.brief, "provider_file", { member_number: v.memberNumber, facility: v.hospital.name, ...args }, SYSTEM_DOWN_HOSPITAL);
    if ("error" in file) return file;
    ctx.emit({ type: "member_file", memberNumber: v.memberNumber, topic: args.topic });
    return file;
  },
});

export const requestHeroGuaranteeTool = defineTool({
  name: "request_hero_guarantee",
  description:
    "Log the hospital's request for a guarantee of payment (an admission, a surgery, a costly procedure, or more than the current guarantee covers) on the patient's case, for Hero's medical team to review and issue in writing. You never issue, approve or promise a guarantee yourself. Collect the details first. Returns the request reference to read back and what to say.",
  schema: z.object({
    urgency: z.enum(["emergency", "urgent", "planned"]),
    service: z.string().describe("Admission, surgery or procedure, in English, e.g. 'open reduction and internal fixation of the right distal radius'"),
    diagnosis: z.string().describe("In English, as the hospital gave it"),
    date: z.string().describe("Admission or procedure date, YYYY-MM-DD"),
    estimated_cost: z.number().optional().describe("The hospital's estimate"),
    currency: z.string().optional().describe("EUR, USD, CLP…"),
    expected_stay_days: z.number().optional(),
    attending_physician: z.string().optional(),
    send_guarantee_to: z.string().describe("The e-mail address or fax number for the written guarantee"),
    case_number: z.string().optional().describe("A Hero case number they quoted (HA-…)"),
  }),
  async execute(args, ctx) {
    const v = await requireHospital(ctx);
    if ("error" in v) return v;
    const res = await system<{ request?: { ref: string; spoken: string }; case?: { number: string; spoken: string } | null; say?: string }>(ctx, v.brief, "gop_request", { member_number: v.memberNumber, facility: v.hospital.name, caller: v.hospital.caller, ...args }, SYSTEM_DOWN_HOSPITAL);
    if ("error" in res) return res;
    await ctx.setOutcome({ gopRequest: { ...args, ref: res.request?.ref ?? null, case_number: res.case?.number ?? null } as Prisma.InputJsonValue });
    ctx.emit({ type: "gop_request", ref: res.request?.ref, caseNumber: res.case?.number });
    return { logged: true, ...res };
  },
});

export const logHospitalUpdateTool = defineTool({
  name: "log_hospital_update",
  description: "Log a medical update the hospital gives on an admitted or treated patient on the case, for Hero's medical team: condition, treatment, next steps, expected discharge, whether the patient can fly. Deteriorating or critical: also hand to a coordinator.",
  schema: z.object({
    condition: z.enum(["stable", "improving", "deteriorating", "critical", "discharged"]),
    update: z.string().describe("Two or three sentences in English: treatment so far, how the patient is"),
    next_steps: z.string().optional().describe("In English"),
    expected_discharge: z.string().optional().describe("YYYY-MM-DD"),
    fit_to_fly: z.string().optional().describe("What the doctor said about flying home, in English, if they said it"),
    reported_by: z.string().describe("Name and role of the person giving the update"),
    case_number: z.string().optional(),
  }),
  async execute(args, ctx) {
    const v = await requireHospital(ctx);
    if ("error" in v) return v;
    const res = await system<{ logged?: boolean; case?: { number: string; spoken: string } | null; say?: string }>(ctx, v.brief, "medical_update", { member_number: v.memberNumber, facility: v.hospital.name, ...args }, SYSTEM_DOWN_HOSPITAL);
    if ("error" in res) return res;
    await ctx.setOutcome({ medicalUpdate: { ...args, case_number: res.case?.number ?? null } as Prisma.InputJsonValue });
    ctx.emit({ type: "medical_update", caseNumber: res.case?.number, condition: args.condition });
    return res;
  },
});

export const logHospitalInvoiceChangeTool = defineTool({
  name: "log_hospital_invoice_change",
  description: "Log a change the hospital announces to an invoice it sent Hero (a corrected amount, a missing line, a cancelled invoice, a resubmission) on the case, and tell them how to send the corrected invoice. The amount on the case only changes when the corrected invoice arrives.",
  schema: z.object({
    reason: z.string().describe("What changed and why, in English"),
    invoice_number: z.string().optional(),
    original_amount: z.number().optional(),
    corrected_amount: z.number().optional(),
    currency: z.string().optional().describe("EUR, USD, CLP…"),
    will_send_by: z.enum(["email", "fax", "portal", "mail"]),
    case_number: z.string().optional(),
  }),
  async execute(args, ctx) {
    const v = await requireHospital(ctx);
    if ("error" in v) return v;
    const res = await system<{ logged?: boolean; case?: { number: string; spoken: string } | null; send_to?: string; say?: string }>(ctx, v.brief, "invoice_change", { member_number: v.memberNumber, facility: v.hospital.name, caller: v.hospital.caller, ...args }, SYSTEM_DOWN_HOSPITAL);
    if ("error" in res) return res;
    await ctx.setOutcome({ invoiceChange: { ...args, case_number: res.case?.number ?? null } as Prisma.InputJsonValue });
    ctx.emit({ type: "invoice_change", caseNumber: res.case?.number });
    return res;
  },
});

export const HERO_TOOLS = [verifyTravellerTool, lookupTravellerFileTool, openHeroCaseTool, verifyHospitalTool, verifyInsuredPatientTool, lookupPatientForHospitalTool, requestHeroGuaranteeTool, logHospitalUpdateTool, logHospitalInvoiceChangeTool];
