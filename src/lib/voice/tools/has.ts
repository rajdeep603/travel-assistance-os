import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { crmCall, CrmUnavailable } from "./crm-connector";
import { fullNameMatches } from "./msh";
import { defineTool, type ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Tools of the HAS Companies (Health Access Services) agents: a US travel
// assistance company and TPA whose travellers mostly come from Latin America.
// The vouchers, the provider network and the cases live in HAS's own portal,
// reached through crmCall (the brief's "_crm_url", signed like a webhook):
//   find_traveller   voucher digits → the traveller and their coverage
//   search_network   where the traveller is + what they need → nearby providers
//   open_case        a new assistance case, with the provider chosen
//   clinic_booking   what the clinic agreed (appointment, guarantee, billing)
//   followup         how the traveller is after the visit
//   handover         a coordinator takes over
// ---------------------------------------------------------------------------

interface HasBrief {
  client?: string;
  case_number?: string;
  callback_promise?: string;
  _crm_url?: string;
}

interface Coverage {
  checked?: boolean;
  verified?: boolean;
  attempts?: number;
  voucher?: string;
  traveller_id?: string;
}

async function stateOf(ctx: ToolContext): Promise<{ brief: HasBrief; coverage: Coverage }> {
  const call = await prisma.call.findUnique({ where: { id: ctx.callId }, select: { outcome: true } });
  const outcome = (call?.outcome as Record<string, unknown> | null) ?? {};
  return { brief: (outcome.brief as HasBrief | undefined) ?? {}, coverage: (outcome.hasCoverage as Coverage | undefined) ?? {} };
}

const DIGITS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  cero: "0", uno: "1", una: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
  um: "1", uma: "1", dois: "2", duas: "2", três: "3", quatro: "4", sete: "7", oito: "8", nove: "9",
};

/** "AV-482117", "A V cuatro ocho dos uno uno siete", "4 8 2 1 1 7" → "482117". */
export function voucherDigits(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ]+/)
    .map((t) => (/^\d+$/.test(t) ? t : DIGITS[t] ?? ""))
    .join("");
}

const PORTAL_DOWN = "HAS's system isn't answering just now.";

export const checkTravellerCoverageTool = defineTool({
  name: "check_traveller_coverage",
  description:
    "Find the caller's travel assistance voucher in HAS's system and check it is theirs: the voucher number (two letters and six digits, from the voucher or card their travel assistance company gave them) and their full name. Returns the coverage (the company that issued it, the plan, the dates, the medical limit, the deductible, whether clinics bill HAS directly) when the name matches, or what to do next. Care never waits on it: if it can't be confirmed, carry on and a coordinator checks it.",
  schema: z.object({
    voucher_number: z.string().describe("As given, e.g. 'AV-482117'"),
    full_name: z.string().describe("First name and surname as given"),
  }),
  async execute(args, ctx) {
    const { brief, coverage } = await stateOf(ctx);
    if (coverage.verified) return { verified: true, note: "Already checked on this call." };
    if ((coverage.attempts ?? 0) >= 2) return { verified: false, say: "Don't ask again. Say a coordinator will confirm the coverage, and carry on helping them." };
    const digits = voucherDigits(args.voucher_number);
    if (digits.length < 6) return { verified: false, reason: "That isn't a full voucher number. Ask for it again: two letters, then six digits. This did not count as an attempt." };
    let found: { traveller: { id: string; name: string; title?: string | null; language?: string | null } | null; coverage?: Record<string, unknown> } | null;
    try {
      found = await crmCall(brief._crm_url, ctx.callRef, "find_traveller", { voucher_number: args.voucher_number, digits });
    } catch (err) {
      if (!(err instanceof CrmUnavailable)) throw err;
      console.warn(`[has] ${ctx.callRef} find_traveller: ${err.message}`);
      return { verified: false, reason: `${PORTAL_DOWN} Say a coordinator will confirm the coverage, and carry on helping them.` };
    }
    const attempts = (coverage.attempts ?? 0) + 1;
    const t = found?.traveller ?? null;
    const verified = Boolean(t && fullNameMatches(args.full_name, t.name));
    await ctx.setOutcome({ hasCoverage: { checked: true, verified, attempts, voucher: args.voucher_number, ...(verified && t ? { traveller_id: t.id } : {}) } as Prisma.InputJsonValue });
    ctx.emit({ type: "coverage", verified, attempts });
    void crmCall(brief._crm_url, ctx.callRef, "coverage_result", { verified, attempts, voucher_number: args.voucher_number, traveller_id: verified && t ? t.id : null }).catch(() => undefined);
    if (verified && t) {
      return { verified: true, traveller: { name: t.name, title: t.title ?? null }, coverage: found?.coverage ?? {}, next: "Thank them by title and surname. Say in one sentence that their assistance is active and that clinics in the HAS network bill HAS directly (they pay only the deductible, if the coverage has one). Don't read the whole coverage out." };
    }
    return attempts >= 2
      ? { verified: false, say: "Still no match. Don't say which detail. Say a coordinator will confirm their coverage, and carry on: find them care now." }
      : { verified: false, reason: "No voucher matches that number and name. Don't say which one. Ask them to read the voucher number again slowly, and their full name as on the voucher." };
  },
});

const NEEDS = ["urgent", "gp", "emergency", "dental", "pharmacy", "peds", "ortho", "ent", "eye", "imaging", "derm", "gyn"] as const;

export const findCareNearbyTool = defineTool({
  name: "find_care_nearby",
  description:
    "Search HAS's own provider network near where the traveller is now, for what they need. Returns up to three providers, nearest suitable first: name, kind, address, distance, whether it's open now and until when, whether it bills HAS directly, whether staff speak Spanish, and the provider id to pass to open_assistance_case. Offer the first; mention the second only if they ask or the first doesn't suit.",
  schema: z.object({
    location: z.string().describe("Where they are now, as precise as they can give it: the hotel name and street, or the address, with the city, e.g. 'Hyatt Regency, International Drive, Orlando'"),
    need: z.enum(NEEDS).describe("urgent = urgent care (minor illness or injury); gp = a doctor's consultation; emergency = a hospital emergency room; peds = a child; ent = ear, nose, throat; ortho = bones, joints, sports injury; eye; dental; pharmacy; imaging = X-ray or scan; derm = skin; gyn"),
    spanish_speaking: z.boolean().optional().describe("True if they would rather be seen by Spanish-speaking staff"),
  }),
  async execute(args, ctx) {
    const { brief } = await stateOf(ctx);
    try {
      const result = await crmCall<{ searched_near?: string; options?: Record<string, unknown>[]; error?: string }>(brief._crm_url, ctx.callRef, "search_network", args);
      if (result.error || !result.options) return { error: `${result.error ?? "The search found nothing."} Ask for the location again (the hotel name and street, or an address and the city).` };
      await ctx.setOutcome({ hasSearch: { location: args.location, need: args.need, searched_near: result.searched_near ?? null, options: result.options.map((o) => ({ id: o.provider_id, name: o.name })) } as Prisma.InputJsonValue });
      ctx.emit({ type: "care_search", need: args.need, near: result.searched_near ?? args.location, count: result.options.length });
      return result.options.length
        ? { ...result, say: "Offer the first option in one or two sentences: the name, how far (in miles and minutes by car if given), open until when, and that it bills HAS directly if it does. Ask if that works for them." }
        : { ...result, say: "Nothing suitable in the network nearby. Say a coordinator will find them a place and call them back; open the case anyway." };
    } catch (err) {
      if (!(err instanceof CrmUnavailable)) throw err;
      return { error: `${PORTAL_DOWN} Say a coordinator will find them a clinic and call them back within fifteen minutes; open the case anyway.` };
    }
  },
});

export const openAssistanceCaseTool = defineTool({
  name: "open_assistance_case",
  description:
    "Open the assistance case in HAS's system once you know who, what is wrong, where they are and, if they agreed to one, the provider they will go to. Returns the case number to read back and what happens next (HAS calls the clinic and sends the guarantee of payment). Call it once.",
  schema: z.object({
    full_name: z.string(),
    voucher_number: z.string().optional(),
    complaint: z.string().describe("What is wrong and since when, in plain English words as the caller described it, e.g. 'ear pain since yesterday, mild fever'. No diagnosis."),
    urgency: z.enum(["routine", "urgent", "emergency"]).describe("emergency = red-flag symptoms (911 told); urgent = to be seen today; routine = can wait for an appointment"),
    location: z.string().describe("Where they are, as used for the search"),
    provider_id: z.string().optional().describe("The id from find_care_nearby of the provider they agreed to"),
    provider_name: z.string().optional(),
    callback_phone: z.string().optional().describe("A number to reach them, in international format if they gave one"),
    language: z.string().describe("The language they speak, in English, e.g. 'Spanish'"),
    travelling_with: z.string().optional().describe("e.g. 'with her husband', 'alone'"),
    notes: z.string().optional().describe("Anything else the coordinator should know, in English"),
  }),
  async execute(args, ctx) {
    const { brief, coverage } = await stateOf(ctx);
    try {
      const result = await crmCall<{ case?: { number: string; spoken?: string }; next_steps?: string[] }>(brief._crm_url, ctx.callRef, "open_case", {
        ...args,
        coverage_verified: Boolean(coverage.verified),
        traveller_id: coverage.verified ? coverage.traveller_id ?? null : null,
      });
      if (!result.case?.number) return { error: "The case could not be opened. Say a coordinator will open it and call them back within fifteen minutes, and make sure you have their number." };
      await ctx.setOutcome({ hasCase: { case_number: result.case.number, urgency: args.urgency, provider_id: args.provider_id ?? null, provider_name: args.provider_name ?? null } as Prisma.InputJsonValue });
      ctx.emit({ type: "case_opened", caseNumber: result.case.number });
      return { opened: true, ...result, say: "Read the case number back slowly, as given in 'spoken', then the next steps in one or two sentences." };
    } catch (err) {
      if (!(err instanceof CrmUnavailable)) throw err;
      return { error: `${PORTAL_DOWN} Say a coordinator will open the case and call them back within fifteen minutes, and make sure you have their number.` };
    }
  },
});

export const handToCoordinatorTool = defineTool({
  name: "hand_to_coordinator",
  description:
    "Pass the call to an HAS assistance coordinator: the caller asks for a person, it's an emergency, they are distressed, or you can't help. Say what you are doing first. The summary is what the coordinator reads before calling them.",
  schema: z.object({
    reason: z.enum(["emergency", "asked_for_person", "distressed", "complaint", "cannot_help", "worse_after_visit", "other"]),
    summary: z.string().describe("Two or three sentences in English: who, where, what they need"),
  }),
  async execute(args, ctx) {
    const { brief } = await stateOf(ctx);
    await ctx.setOutcome({ handoff: { target: "coordinator", reason: args.reason, summary: args.summary, at: new Date().toISOString() } });
    ctx.emit({ type: "handoff", target: "coordinator", reason: args.reason, summary: args.summary });
    void crmCall(brief._crm_url, ctx.callRef, "handover", { ...args, case_number: brief.case_number ?? null }).catch(() => undefined);
    const promise = brief.callback_promise ?? "an HAS coordinator will call them back within fifteen minutes";
    return { handed_over: true, say: `Say a coordinator has the summary and that ${promise}; make sure you have their number, and thank them.` };
  },
});

export const recordClinicBookingTool = defineTool({
  name: "record_clinic_booking",
  description:
    "Save what the clinic agreed for the patient in the brief: whether they will see the patient and when, whether they accept HAS's guarantee of payment and bill HAS directly, where the guarantee should be sent, what the patient must bring, and who you spoke to. Call it once, before ending, with everything; null for what you couldn't find out.",
  schema: z.object({
    reached_right_place: z.boolean(),
    will_see_patient: z.boolean().nullable(),
    appointment: z.string().optional().describe("When, as agreed, e.g. 'today 3:30 pm' or 'walk in now, about 30 minutes wait'"),
    walk_in: z.boolean().optional(),
    accepts_guarantee: z.boolean().nullable().optional().describe("Accepts HAS's guarantee of payment and bills HAS directly"),
    guarantee_send_to: z.string().optional().describe("Fax number or e-mail where the guarantee of payment should go, read back and confirmed"),
    patient_should_bring: z.array(z.string()).optional().describe("e.g. passport, the voucher, a photo ID"),
    spanish_speaking_staff: z.boolean().nullable().optional(),
    estimated_cost: z.string().optional().describe("If they gave one, e.g. 'urgent care visit USD 180'"),
    contact_name: z.string().optional(),
    contact_role: z.string().optional(),
    reason_if_not: z.string().optional().describe("If they can't see the patient: why, and any alternative they suggested"),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    const { brief } = await stateOf(ctx);
    await ctx.setOutcome({ clinicBooking: args as Prisma.InputJsonValue });
    ctx.emit({ type: "clinic_booking", booking: args });
    void crmCall(brief._crm_url, ctx.callRef, "clinic_booking", { case_number: brief.case_number ?? null, ...args }).catch(() => undefined);
    return { saved: true };
  },
});

export const recordTravellerFollowupTool = defineTool({
  name: "record_traveller_followup",
  description:
    "Save how the traveller is after the visit: whether they were seen, how they feel now, medication, anything they paid themselves (amount and whether they kept the receipt), whether they need a follow-up visit or anything else, and how they rate the help. Call it once, before ending.",
  schema: z.object({
    reached_traveller: z.boolean(),
    was_seen: z.boolean().nullable(),
    feeling: z.enum(["better", "same", "worse", "unknown"]),
    medication: z.string().optional().describe("What they were given or prescribed, and whether they have it, in their words"),
    paid_out_of_pocket: z.boolean().nullable().optional(),
    amount_paid: z.string().optional().describe("e.g. 'USD 45 at the pharmacy'"),
    has_receipts: z.boolean().optional(),
    needs_followup_visit: z.boolean().optional(),
    other_needs: z.string().optional().describe("Anything else they need from HAS, in English"),
    satisfaction: z.number().int().min(1).max(5).optional().describe("1 to 5, if they gave a rating"),
    red_flag: z.boolean().optional().describe("True if they describe red-flag symptoms or feeling much worse"),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    const { brief } = await stateOf(ctx);
    await ctx.setOutcome({ travellerFollowup: args as Prisma.InputJsonValue });
    ctx.emit({ type: "followup", followup: args });
    void crmCall(brief._crm_url, ctx.callRef, "followup", { case_number: brief.case_number ?? null, ...args }).catch(() => undefined);
    return { saved: true };
  },
});

export const HAS_TOOLS = [checkTravellerCoverageTool, findCareNearbyTool, openAssistanceCaseTool, handToCoordinatorTool, recordClinicBookingTool, recordTravellerFollowupTool];
