import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { dobMatches, parseDob } from "./collections";
import { crmCall, CrmUnavailable } from "./crm-connector";
import { editDistance } from "./tpa";
import { defineTool, type ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Tools of a member line that works in the client's own CRM (the MSH Americas
// POC): the member's record, policy, benefits and cases stay in the client's
// system and are reached through crmCall. The caller is verified on three
// factors (member number, full name, date of birth) before anything about a
// member is said; the case and benefit facts only come back after that.
// ---------------------------------------------------------------------------

interface MemberBrief {
  client?: string;
  _crm_url?: string;
}

interface CrmMember {
  number: string;
  name: string;
  dob: string;
  title?: string | null;
}

interface Identity {
  verified?: boolean;
  attempts?: number;
  member_number?: string;
  locked?: boolean;
}

async function stateOf(ctx: ToolContext): Promise<{ brief: MemberBrief; identity: Identity }> {
  const call = await prisma.call.findUnique({ where: { id: ctx.callId }, select: { outcome: true } });
  const outcome = (call?.outcome as Record<string, unknown> | null) ?? {};
  return { brief: (outcome.brief as MemberBrief | undefined) ?? {}, identity: (outcome.identity as Identity | undefined) ?? {} };
}

const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  zéro: "0", un: "1", une: "1", deux: "2", trois: "3", quatre: "4", cinq: "5", sept: "7", huit: "8", neuf: "9",
};

/** "MSH-410-287", "M S H four one zero two eight seven", "quatre un zéro…" → "410287". */
export function memberDigits(input: string | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ]+/)
    .map((t) => (/^\d+$/.test(t) ? t : DIGIT_WORDS[t] ?? ""))
    .join("");
}

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "mme", "mlle", "m", "madame", "monsieur", "mister"]);

/** Lower-case letters only, accents dropped, titles out; hyphenated names split ("Al-Mansouri" → al, mansouri). */
export function nameWords(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s'-]/g, " ")
    .split(/[\s'-]+/)
    .filter((w) => w.length > 0 && !TITLES.has(w));
}

const close = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && editDistance(a, b) <= (Math.max(a.length, b.length) >= 7 ? 2 : 1));

/**
 * The full name the caller gave against the record. Both the first name and
 * the surname must be there; a phone line garbles a letter or two.
 */
export function fullNameMatches(given: string, record: string): boolean {
  const g = nameWords(given);
  const r = nameWords(record);
  if (g.length < 2 || r.length < 2) return false;
  if (close(g.join(""), r.join(""))) return true;
  const firstOk = close(g[0], r[0]);
  // The surname may be one word or several ("al mansouri"): compare what follows the first name.
  const lastOk = close(g.slice(1).join(""), r.slice(1).join("")) || close(g[g.length - 1], r[r.length - 1]);
  return firstOk && lastOk;
}

const CRM_DOWN = { error: "The member system isn't answering just now. Apologise, take their phone number, and say a member services agent will call them back within the hour. Say nothing about any member or case." };

export const verifyMemberIdentityTool = defineTool({
  name: "verify_member_identity",
  description:
    "Check that the caller is the member, on three factors: member number, full name (first name and surname) and date of birth. Call it once you have all three. Returns verified true with the member's name, or verified false with what to do. Nothing about a member, policy or case may be said before it returns verified true. After two failed attempts it locks: apologise, offer a call-back, and say nothing about any member.",
  schema: z.object({
    member_number: z.string().describe("As given, e.g. 'MSH-410-287' (letters, then the six digits)"),
    full_name: z.string().describe("First name and surname as given, e.g. 'Sarah Okafor'"),
    date_of_birth: z.string().describe("YYYY-MM-DD, e.g. '1996-03-14'"),
  }),
  async execute(args, ctx) {
    const { brief, identity } = await stateOf(ctx);
    if (identity.verified) return { verified: true, note: "Already verified on this call." };
    if (identity.locked || (identity.attempts ?? 0) >= 2) {
      return { verified: false, locked: true, say: "Verification is locked after two attempts. Apologise, offer a call-back from a member services agent (take their phone number), and say nothing about any member or case." };
    }
    const digits = memberDigits(args.member_number);
    if (digits.length < 6) return { verified: false, reason: "That isn't a full member number. Ask for it again: the letters, then six digits, from their member card. This did not count as an attempt." };
    if (nameWords(args.full_name).length < 2) return { verified: false, reason: "Ask for their first name and surname. This did not count as an attempt." };
    if (!parseDob(args.date_of_birth)) return { verified: false, reason: "Ask for the date of birth again: day, month and year. This did not count as an attempt." };

    let member: CrmMember | null;
    try {
      member = (await crmCall<{ member: CrmMember | null }>(brief._crm_url, ctx.callRef, "find_member", { member_number: args.member_number, digits })).member;
    } catch (err) {
      if (err instanceof CrmUnavailable) {
        console.warn(`[msh] ${ctx.callRef} find_member: ${err.message}`);
        return CRM_DOWN;
      }
      throw err;
    }
    const attempts = (identity.attempts ?? 0) + 1;
    const checks = { number: Boolean(member), name: Boolean(member && fullNameMatches(args.full_name, member.name)), dob: Boolean(member && dobMatches(args.date_of_birth, member.dob)) };
    const verified = checks.number && checks.name && checks.dob;
    const next: Identity = verified ? { verified: true, attempts, member_number: member!.number } : { verified: false, attempts, locked: attempts >= 2 };
    await ctx.setOutcome({ identity: { ...next, checks } as Prisma.InputJsonValue, identityVerified: verified });
    ctx.emit({ type: "identity", verified, attempts, ...(verified ? { memberNumber: member!.number } : {}) });
    void crmCall(brief._crm_url, ctx.callRef, "identity_result", { verified, attempts, checks, member_number: verified ? member!.number : null, given_number: args.member_number }).catch(() => undefined);
    if (verified) {
      return { verified: true, member: { number: member!.number, name: member!.name, title: member!.title ?? null }, next: "Thank them, then call lookup_member_case before answering anything." };
    }
    // Never say which factor failed: that would help someone guess.
    return attempts >= 2
      ? { verified: false, locked: true, say: "The details still don't match. Apologise, say that for their privacy you can't go further on this call, and offer a call-back from a member services agent (take their phone number). Say nothing about any member, policy or case, and don't say which detail was wrong." }
      : { verified: false, reason: "The details don't match our records. Don't say which one. Ask them to give all three again slowly: the member number from their card, their full name, and their date of birth." };
  },
});

async function requireVerified(ctx: ToolContext): Promise<{ brief: MemberBrief; memberNumber: string } | { error: string }> {
  const { brief, identity } = await stateOf(ctx);
  if (!identity.verified || !identity.member_number) return { error: "The caller isn't verified. Verify them first with verify_member_identity; say nothing about any member or case until then." };
  return { brief, memberNumber: identity.member_number };
}

export const lookupMemberCaseTool = defineTool({
  name: "lookup_member_case",
  description:
    "Pull up the verified member's file in the CRM: their plan and coverage dates, the benefits (covered or not, limits, deductible, co-pay or co-insurance, what's used and what remains, pre-authorisation rules) and their cases with status, documents and the next step. Answer status and benefit questions only from what it returns.",
  schema: z.object({
    topic: z.enum(["status", "benefits", "both"]).describe("What the member is asking about"),
    case_number: z.string().optional().describe("A case number the member mentioned, e.g. MSH-C-7731"),
  }),
  async execute(args, ctx) {
    const v = await requireVerified(ctx);
    if ("error" in v) return v;
    try {
      const file = await crmCall<Record<string, unknown>>(v.brief._crm_url, ctx.callRef, "member_file", { member_number: v.memberNumber, topic: args.topic, case_number: args.case_number ?? null });
      ctx.emit({ type: "member_file", memberNumber: v.memberNumber, topic: args.topic });
      await ctx.setOutcome({ lookedUp: { member_number: v.memberNumber, topic: args.topic, case_number: args.case_number ?? null } });
      return file;
    } catch (err) {
      if (err instanceof CrmUnavailable) return CRM_DOWN;
      throw err;
    }
  },
});

export const openMemberCaseTool = defineTool({
  name: "open_member_case",
  description:
    "Open a new case in the CRM for the verified member: a new incident they are calling about (an injury, an illness, a visit to a clinic or hospital). Collect what happened, when, where and the clinic or hospital first. Returns the new case number to read back, and what the member should do next.",
  schema: z.object({
    incident: z.string().describe("What happened, in a few English words, e.g. 'sprained ankle playing basketball'"),
    incident_date: z.string().describe("YYYY-MM-DD"),
    care_type: z.enum(["walk_in_clinic", "emergency_room", "hospital_admission", "doctor_visit", "pharmacy", "physiotherapy", "imaging", "dental", "other"]),
    provider: z.string().optional().describe("The clinic or hospital, if they know it"),
    city: z.string().optional(),
    paid_out_of_pocket: z.boolean().optional().describe("Whether they paid anything themselves"),
    amount_paid: z.number().optional().describe("How much, if they paid"),
    callback_phone: z.string().optional(),
    notes: z.string().optional().describe("Anything else the case manager should know, in English"),
  }),
  async execute(args, ctx) {
    const v = await requireVerified(ctx);
    if ("error" in v) return v;
    try {
      const result = await crmCall<{ case?: { number: string; spoken?: string }; next_steps?: string[] }>(v.brief._crm_url, ctx.callRef, "open_case", { member_number: v.memberNumber, ...args });
      if (!result.case?.number) return { error: "The case could not be opened. Apologise and say a member services agent will open it and call them back within the hour." };
      await ctx.setOutcome({ caseOpened: { member_number: v.memberNumber, case_number: result.case.number, incident: args.incident, care_type: args.care_type } as Prisma.InputJsonValue });
      ctx.emit({ type: "case_opened", memberNumber: v.memberNumber, caseNumber: result.case.number });
      return { opened: true, ...result, say: "Read the case number back slowly, as given in 'spoken', then the next steps." };
    } catch (err) {
      if (err instanceof CrmUnavailable) return { error: "The member system isn't answering just now. Apologise, say a member services agent will open the case and call them back within the hour, and take their phone number." };
      throw err;
    }
  },
});

export const MSH_TOOLS = [verifyMemberIdentityTool, lookupMemberCaseTool, openMemberCaseTool];
