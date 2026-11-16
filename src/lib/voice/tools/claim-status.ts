import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { claimStatusCases, type ClaimStatusFacts } from "@/lib/services/claim-status";
import { dobMatches } from "./collections";
import { editDistance, findClaim, refDigits } from "./tpa";
import { defineTool, type ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Tools of the claim status line. verify_claim_caller is the only way to a
// claim: the caller says who they are (the member, a hospital or clinic, a
// broker) and proves it the way that kind of caller can; the claim comes
// back as that caller may hear it. The claims come from the API brief's
// `_cases` (a client's own system) or, without one, from CareTrail's claims.
// ---------------------------------------------------------------------------

type CallerType = "member" | "provider" | "broker";

async function outcomeOf(ctx: ToolContext): Promise<Record<string, unknown>> {
  const call = await prisma.call.findUnique({ where: { id: ctx.callId }, select: { outcome: true } });
  return (call?.outcome as Record<string, unknown> | null) ?? {};
}

async function casesFor(ctx: ToolContext): Promise<ClaimStatusFacts[]> {
  const brief = ((await outcomeOf(ctx)).brief ?? {}) as { _cases?: ClaimStatusFacts[] };
  return Array.isArray(brief._cases) ? brief._cases : claimStatusCases();
}

/** Words that say what or where an organisation is, not which one ("hospital", "rumah sakit", "demo", "Indonesia"). */
const GENERIC = new Set(
  "the of and de del la le du di da dan hospital hospitals hastanesi hastane clinic clinique clinica klinik medical medika medica center centre centro health healthcare care rumah sakit rs rsu umum demo international insurance insurances asuransi broker brokers brokerage benefits benefit services group pt tbk ltd limited inc llc co company sdn bhd sa gmbh global asia pacific indonesia singapore malaysia thailand turkey turkiye jakarta bali denpasar surabaya bandung medan istanbul antalya".split(" ")
);

const tokens = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);

/**
 * "Kuta Medika", "RS Kuta Medika Denpasar" → "Rumah Sakit Kuta Medika Demo, Denpasar": its distinctive words in
 * common, a phone line's spelling allowed; two when it has two or more, so "PT Jaya Indonesia" or "Mitra Sehat"
 * never pass for "PT Mitra Proteksi Indonesia", and a city or country alone never verifies anyone.
 */
export function organisationMatches(said: string | undefined, onFile: string | null | undefined): boolean {
  if (!said || !onFile) return false;
  const theirs = tokens(onFile).filter((w) => !GENERIC.has(w));
  const given = tokens(said).filter((w) => !GENERIC.has(w));
  if (!theirs.length || !given.length) return false;
  const hit = (t: string) => given.some((g) => g === t || (g.length >= 5 && t.length >= 5 && editDistance(g, t) <= 2) || (g.length >= 4 && t.startsWith(g)));
  return theirs.filter(hit).length >= Math.min(2, theirs.length);
}

/** "M P I zero four one seven", "MPI-0417", "0417" → the code's digits match. */
export function codeMatches(said: string | undefined, onFile: string | null | undefined): boolean {
  const a = refDigits(said);
  const b = (onFile ?? "").replace(/\D/g, "");
  return a.length >= 3 && b.length >= 3 && (a === b || (a.length >= 4 && b.endsWith(a)));
}

/** The claim as this kind of caller may hear it. */
export function viewFor(claim: ClaimStatusFacts, who: CallerType): Record<string, unknown> {
  const base = { ref: claim.ref, insurer: claim.insurer ?? undefined, amount: claim.amount ?? undefined };
  if (who === "member") {
    return {
      ...base,
      member: claim.member,
      provider: claim.provider ?? undefined,
      treatment: claim.treatment ?? undefined,
      dates: claim.dates ?? undefined,
      documents_received: claim.documents_received,
      documents_missing: claim.documents_missing,
      case_manager: claim.case_manager ?? undefined,
      ...claim.for_member,
    };
  }
  if (who === "provider") {
    return {
      ...base,
      patient: claim.member,
      provider: claim.provider ?? undefined,
      dates: claim.dates ?? undefined,
      documents_received: claim.documents_received,
      documents_missing: claim.documents_missing,
      ...claim.for_provider,
    };
  }
  return {
    ...base,
    member: claim.member,
    policy_number: claim.policy_number ?? undefined,
    broker: claim.broker?.name,
    documents_missing: claim.documents_missing,
    medical_details: "Not shared with brokers: no diagnosis, treatment or hospital notes. Offer the member or a case manager for those.",
    ...claim.for_broker,
  };
}

const NOT_FOUND_TWICE = "You can't verify them. Apologise, offer a call-back from a case manager (take their name and number), and say nothing about any claim, not even whether one exists.";

export const verifyClaimCallerTool = defineTool({
  name: "verify_claim_caller",
  description:
    "Check who is calling before anything about a claim is said. Members: the claim number (or their full name) and their date of birth. Providers (a hospital or clinic): the name of the hospital or clinic, the claim number (or the patient's full name) and the patient's date of birth. Brokers: the brokerage's name or broker code, the claim number (or the member's full name), and the member's date of birth or policy number. Returns verified true with the claim as that caller may hear it, or verified false with what to do.",
  schema: z.object({
    caller_type: z.enum(["member", "provider", "broker"]),
    claim_ref: z.string().optional().describe("The claim number as they said it, e.g. GEM-240346 or CLM-10253"),
    member_name: z.string().optional().describe("The member's (patient's) full name, when there is no claim number"),
    date_of_birth: z.string().optional().describe("The member's (patient's) date of birth as YYYY-MM-DD"),
    organisation: z.string().optional().describe("Providers: the hospital or clinic. Brokers: the brokerage."),
    broker_code: z.string().optional().describe("Brokers: their broker code, as said"),
    policy_number: z.string().optional().describe("Brokers: the member's policy number, when they give it instead of the date of birth"),
    caller_name: z.string().optional().describe("The caller's own name, if they gave it"),
  }),
  async execute(args, ctx) {
    const outcome = await outcomeOf(ctx);
    const attempts = ((outcome.identity as { attempts?: number } | undefined)?.attempts ?? 0) + 1;
    const fail = async (reason: string, retry: string) => {
      await ctx.setOutcome({ identity: { verified: false, attempts, caller_type: args.caller_type, reason }, identityVerified: false });
      ctx.emit({ type: "identity", verified: false, attempts });
      return attempts >= 2 ? { verified: false, say: NOT_FOUND_TWICE } : { verified: false, reason: retry };
    };
    const claims = (await casesFor(ctx)) as unknown as Parameters<typeof findClaim>[0];
    const claim = findClaim(claims, args.claim_ref, args.member_name) as unknown as ClaimStatusFacts | null;
    if (!claim) return fail("claim not found", "No claim matches. Ask for the claim number digit by digit, or the member's full name spelled out.");

    const dobOk = dobMatches(args.date_of_birth, claim.dob);
    if (args.caller_type === "member" && !dobOk) return fail("date of birth did not match", "The details don't match. Ask for the date of birth once more, slowly.");
    if (args.caller_type === "provider") {
      if (!organisationMatches(args.organisation, claim.provider)) return fail("provider not on this claim", "The details don't match our records. Ask them to confirm the full name of their hospital or clinic and the claim number.");
      if (!dobOk) return fail("patient's date of birth did not match", "The details don't match. Ask for the patient's date of birth once more.");
    }
    if (args.caller_type === "broker") {
      const brokerOk = Boolean(claim.broker) && (codeMatches(args.broker_code, claim.broker!.code) || organisationMatches(args.organisation, claim.broker!.name));
      if (!brokerOk) return fail("broker not on this policy", "The details don't match our records. Ask for their broker code and the name of their brokerage once more.");
      const policyOk = Boolean(args.policy_number) && refDigits(args.policy_number).length >= 4 && (claim.policy_number ?? "").replace(/\D/g, "").endsWith(refDigits(args.policy_number));
      if (!dobOk && !policyOk) return fail("member's date of birth or policy number did not match", "The details don't match. Ask for the member's date of birth or policy number once more.");
    }

    await ctx.setOutcome({
      identity: { verified: true, attempts, case_ref: claim.ref, caller_type: args.caller_type, organisation: args.organisation ?? null, caller_name: args.caller_name ?? null },
      identityVerified: true,
    });
    ctx.emit({ type: "identity", verified: true, caseRef: claim.ref });
    return { verified: true, caller_type: args.caller_type, claim: viewFor(claim, args.caller_type) };
  },
});

export const recordStatusEnquiryTool = defineTool({
  name: "record_status_enquiry",
  description: "Save how the claim status call ended: who called (member, provider or broker), about which claim, what they asked, and the outcome. Call it once, before ending.",
  schema: z.object({
    caller_type: z.enum(["member", "provider", "broker", "unknown"]),
    outcome: z.enum(["status_given", "callback_requested", "escalated", "not_verified", "wrong_number", "no_answer"]),
    claim_ref: z.string().optional(),
    organisation: z.string().optional().describe("The hospital, clinic or brokerage"),
    caller_name: z.string().optional(),
    question: z.string().optional().describe("What they wanted to know, in a few words, in English"),
    callback_time: z.string().optional().describe("When a case manager should call back, as agreed"),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ statusEnquiry: args as Prisma.InputJsonValue });
    ctx.emit({ type: "status_enquiry", statusEnquiry: args });
    return { saved: true };
  },
});

export const CLAIM_STATUS_TOOLS = [verifyClaimCallerTool, recordStatusEnquiryTool];
