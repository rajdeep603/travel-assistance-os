import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { dobMatches, parseDob } from "./collections";
import { crmCall, CrmUnavailable } from "./crm-connector";
import { fullNameMatches, memberDigits, nameWords } from "./msh";
import { defineTool, type ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Tools of an insurer's provider line that works in the insurer's own CRM
// (the MSH Americas POC): hospitals, clinics and billing offices call about a
// patient who is a member. Two checks before anything is said: the facility
// must be one the insurer knows (an unknown one gets a call-back on its listed
// number), and the patient must match on member number, full name and date
// of birth. The provider then hears only what its own care and billing need:
// eligibility and the benefit for the service, the status and payment of its
// own invoices. Guarantees of payment, medical updates and invoice changes
// are logged on the case for a case manager; the AI never commits MSH to pay.
// ---------------------------------------------------------------------------

interface Brief {
  _crm_url?: string;
}

interface ProviderOnCall {
  name: string;
  city?: string | null;
  caller: string;
  role?: string | null;
  callback?: string | null;
}

interface Identity {
  verified?: boolean;
  attempts?: number;
  member_number?: string;
  locked?: boolean;
}

async function stateOf(ctx: ToolContext): Promise<{ brief: Brief; identity: Identity; provider: ProviderOnCall | null }> {
  const call = await prisma.call.findUnique({ where: { id: ctx.callId }, select: { outcome: true } });
  const outcome = (call?.outcome as Record<string, unknown> | null) ?? {};
  return { brief: (outcome.brief as Brief | undefined) ?? {}, identity: (outcome.identity as Identity | undefined) ?? {}, provider: (outcome.provider as ProviderOnCall | undefined) ?? null };
}

const CRM_DOWN = { error: "MSH's member system isn't answering just now. Apologise, take the caller's name and call-back number, and say a case manager will call them back within the hour. Say nothing about the patient." };

async function crm<T>(ctx: ToolContext, brief: Brief, action: string, args: Record<string, unknown>): Promise<T | { error: string }> {
  try {
    return await crmCall<T>(brief._crm_url, ctx.callRef, action, args);
  } catch (err) {
    if (err instanceof CrmUnavailable) {
      console.warn(`[msh-provider] ${ctx.callRef} ${action}: ${err.message}`);
      return CRM_DOWN;
    }
    throw err;
  }
}

export const verifyFacilityTool = defineTool({
  name: "verify_facility",
  description:
    "Check the calling facility against MSH's provider file, first thing once you have the facility's name and the caller's name. Returns known true (then ask for the patient's details), or what to do for an unknown facility.",
  schema: z.object({
    facility: z.string().describe("The hospital, clinic or office calling, as they named it"),
    caller_name: z.string().describe("The caller's name"),
    caller_role: z.string().optional().describe("e.g. admitting clerk, billing office, nurse"),
    callback_number: z.string().optional().describe("A number to call them back on"),
  }),
  async execute(args, ctx) {
    const { brief, provider: already } = await stateOf(ctx);
    if (already && (already as ProviderOnCall & { known?: boolean }).known) return { known: true, provider: { name: already.name }, note: "Already checked on this call. Now get the patient's member number, full name and date of birth, then verify_patient." };
    const found = await crm<{ provider: { name: string; city?: string | null } | null }>(ctx, brief, "find_provider", { facility: args.facility });
    if ("error" in found) return found;
    if (!found.provider) {
      await ctx.setOutcome({ provider: { name: args.facility, known: false, caller: args.caller_name, role: args.caller_role ?? null, callback: args.callback_number ?? null } as Prisma.InputJsonValue });
      void crm(ctx, brief, "identity_result", { verified: false, attempts: 0, provider_unknown: true, facility: args.facility, caller: args.caller_name });
      return {
        known: false,
        say: "MSH can't find this facility in its provider file. Say so politely, take the caller's role and the facility's main number, and say a case manager will call the facility back on its listed number to help. Say nothing about any patient, not even whether they are a member. Then record_provider_call (provider_unknown) and end politely.",
      };
    }
    const provider = { name: found.provider.name, city: found.provider.city ?? null, caller: args.caller_name, role: args.caller_role ?? null, callback: args.callback_number ?? null, known: true };
    await ctx.setOutcome({ provider: provider as Prisma.InputJsonValue });
    ctx.emit({ type: "provider", provider: provider.name });
    return { known: true, provider: { name: provider.name, city: provider.city }, next: "Now ask, one at a time, the patient's member number (read it back), full name and date of birth, then call verify_patient." };
  },
});

export const verifyPatientTool = defineTool({
  name: "verify_patient",
  description:
    "Check that the patient the facility is calling about is an MSH member, on three factors: member number, full name and date of birth. Call it once you have all three, after verify_facility returned known true. Nothing about the patient may be said before it returns verified true. After two failed attempts it locks.",
  schema: z.object({
    member_number: z.string().describe("As given, in the format MSH-123-456 (letters, then six digits)"),
    full_name: z.string().describe("The patient's first name and surname"),
    date_of_birth: z.string().describe("YYYY-MM-DD, e.g. '2004-01-15'"),
  }),
  async execute(args, ctx) {
    const { brief, identity, provider } = await stateOf(ctx);
    if (!provider || !(provider as ProviderOnCall & { known?: boolean }).known) return { verified: false, reason: "Check the facility first with verify_facility (its name and the caller's name)." };
    if (identity.verified) return { verified: true, note: "Already verified on this call." };
    if (identity.locked || (identity.attempts ?? 0) >= 2) {
      return { verified: false, locked: true, say: "Verification is locked after two attempts. Apologise, say a case manager will call the facility back on its listed number, and say nothing about the patient." };
    }
    const digits = memberDigits(args.member_number);
    if (digits.length < 6) return { verified: false, reason: "That isn't a full member number. Ask for it again from the patient's MSH card: the letters, then six digits. This did not count as an attempt." };
    if (nameWords(args.full_name).length < 2) return { verified: false, reason: "Ask for the patient's first name and surname. This did not count as an attempt." };
    if (!parseDob(args.date_of_birth)) return { verified: false, reason: "Ask for the patient's date of birth again: day, month and year. This did not count as an attempt." };

    const res = await crm<{ member: { number: string; name: string; dob: string; title?: string | null } | null }>(ctx, brief, "find_member", { member_number: args.member_number, digits });
    if ("error" in res) return res;
    const member = res.member;
    const attempts = (identity.attempts ?? 0) + 1;
    const checks = { number: Boolean(member), name: Boolean(member && fullNameMatches(args.full_name, member.name)), dob: Boolean(member && dobMatches(args.date_of_birth, member.dob)) };
    const verified = checks.number && checks.name && checks.dob;
    const next: Identity = verified ? { verified: true, attempts, member_number: member!.number } : { verified: false, attempts, locked: attempts >= 2 };
    await ctx.setOutcome({ identity: { ...next, checks } as Prisma.InputJsonValue, identityVerified: verified });
    ctx.emit({ type: "identity", verified, attempts, ...(verified ? { memberNumber: member!.number } : {}) });
    void crm(ctx, brief, "identity_result", { verified, attempts, checks, member_number: verified ? member!.number : null, given_number: args.member_number, provider: { name: provider.name, caller: provider.caller, role: provider.role ?? null } });
    if (verified) {
      return { verified: true, patient: { number: member!.number, name: member!.name, title: member!.title ?? null }, next: "Thank them, then call lookup_patient_for_provider for what they asked before answering." };
    }
    return attempts >= 2
      ? { verified: false, locked: true, say: "The patient's details still don't match. Apologise, say that for the member's privacy you can't go further on this call, and that a case manager will call the facility back on its listed number. Say nothing about the patient and don't say which detail was wrong." }
      : { verified: false, reason: "The patient's details don't match MSH's records. Don't say which one. Ask for the member number from the patient's card, the full name and the date of birth again, slowly." };
  },
});

async function requireVerified(ctx: ToolContext): Promise<{ brief: Brief; memberNumber: string; provider: ProviderOnCall } | { error: string }> {
  const { brief, identity, provider } = await stateOf(ctx);
  if (!identity.verified || !identity.member_number || !provider) return { error: "The facility and the patient aren't verified. Use verify_facility, then verify_patient; say nothing about the patient until then." };
  return { brief, memberNumber: identity.member_number, provider };
}

export const lookupPatientForProviderTool = defineTool({
  name: "lookup_patient_for_provider",
  description:
    "What the verified provider may know about the patient: whether coverage is active on the date of service, the plan, the benefit for the service they name (percentage, limits, deductible left, pre-authorisation), whether MSH bills directly and where invoices go, and the status of this facility's own cases and invoices (received, in review, approved, paid on which date with which payment reference, what is missing). Answer only from what it returns.",
  schema: z.object({
    topic: z.enum(["eligibility", "benefits", "claim_status", "guarantee", "case"]).describe("What the provider is asking about"),
    service: z.string().optional().describe("The service or care, in English: 'inpatient admission', 'MRI', 'emergency visit', 'surgery'"),
    date_of_service: z.string().optional().describe("YYYY-MM-DD, if they gave one"),
    case_number: z.string().optional().describe("An MSH case or reference number they quoted"),
  }),
  async execute(args, ctx) {
    const v = await requireVerified(ctx);
    if ("error" in v) return v;
    const file = await crm<Record<string, unknown>>(ctx, v.brief, "provider_file", { member_number: v.memberNumber, facility: v.provider.name, ...args });
    if ("error" in file) return file;
    ctx.emit({ type: "member_file", memberNumber: v.memberNumber, topic: args.topic });
    return file;
  },
});

export const requestGuaranteeOfPaymentTool = defineTool({
  name: "request_guarantee_of_payment",
  description:
    "Log the provider's request for a guarantee of payment (an admission, a surgery, a costly procedure) on the patient's case, for a case manager to review and issue in writing. You never issue or promise a guarantee yourself. Collect the details first. Returns the request reference to read back and what to say.",
  schema: z.object({
    urgency: z.enum(["emergency", "urgent", "planned"]),
    service: z.string().describe("Admission, surgery or procedure, in English, e.g. 'open reduction and internal fixation of the right wrist'"),
    diagnosis: z.string().describe("In English, as the provider gave it"),
    date: z.string().describe("Admission or procedure date, YYYY-MM-DD"),
    estimated_cost_cad: z.number().optional(),
    expected_stay_days: z.number().optional(),
    attending_physician: z.string().optional(),
    send_guarantee_to: z.string().describe("The fax number or e-mail address for the written guarantee"),
    case_number: z.string().optional().describe("An MSH case number they quoted"),
  }),
  async execute(args, ctx) {
    const v = await requireVerified(ctx);
    if ("error" in v) return v;
    const res = await crm<{ request?: { ref: string; spoken: string }; case?: { number: string; spoken: string } | null; say?: string }>(ctx, v.brief, "gop_request", { member_number: v.memberNumber, facility: v.provider.name, caller: v.provider.caller, ...args });
    if ("error" in res) return res;
    await ctx.setOutcome({ gopRequest: { ...args, ref: res.request?.ref ?? null, case_number: res.case?.number ?? null } as Prisma.InputJsonValue });
    ctx.emit({ type: "gop_request", ref: res.request?.ref, caseNumber: res.case?.number });
    return { logged: true, ...res };
  },
});

export const logMedicalUpdateTool = defineTool({
  name: "log_medical_update",
  description: "Log a medical update the hospital gives on an admitted or treated patient on the case, for MSH's case manager and medical team: condition, treatment, next steps, expected discharge. Deteriorating or critical: also hand to a case manager.",
  schema: z.object({
    condition: z.enum(["stable", "improving", "deteriorating", "critical", "discharged"]),
    update: z.string().describe("Two or three sentences in English: treatment so far, how the patient is"),
    next_steps: z.string().optional().describe("In English"),
    expected_discharge: z.string().optional().describe("YYYY-MM-DD"),
    reported_by: z.string().describe("Name and role of the person giving the update"),
    case_number: z.string().optional(),
  }),
  async execute(args, ctx) {
    const v = await requireVerified(ctx);
    if ("error" in v) return v;
    const res = await crm<{ logged?: boolean; case?: { number: string; spoken: string } | null; say?: string }>(ctx, v.brief, "medical_update", { member_number: v.memberNumber, facility: v.provider.name, ...args });
    if ("error" in res) return res;
    await ctx.setOutcome({ medicalUpdate: { ...args, case_number: res.case?.number ?? null } as Prisma.InputJsonValue });
    ctx.emit({ type: "medical_update", caseNumber: res.case?.number, condition: args.condition });
    return res;
  },
});

export const logInvoiceChangeTool = defineTool({
  name: "log_invoice_change",
  description: "Log a change the provider announces to an invoice it sent (a corrected amount, a missing line, a cancelled invoice, a resubmission) on the case, and tell them how to send the corrected invoice. The amount on the case only changes when the corrected invoice arrives.",
  schema: z.object({
    reason: z.string().describe("What changed and why, in English"),
    invoice_number: z.string().optional(),
    original_amount_cad: z.number().optional(),
    corrected_amount_cad: z.number().optional(),
    will_send_by: z.enum(["email", "fax", "portal", "mail"]),
    case_number: z.string().optional(),
  }),
  async execute(args, ctx) {
    const v = await requireVerified(ctx);
    if ("error" in v) return v;
    const res = await crm<{ logged?: boolean; case?: { number: string; spoken: string } | null; send_to?: string; say?: string }>(ctx, v.brief, "invoice_change", { member_number: v.memberNumber, facility: v.provider.name, caller: v.provider.caller, ...args });
    if ("error" in res) return res;
    await ctx.setOutcome({ invoiceChange: { ...args, case_number: res.case?.number ?? null } as Prisma.InputJsonValue });
    ctx.emit({ type: "invoice_change", caseNumber: res.case?.number });
    return res;
  },
});

export const recordProviderCallTool = defineTool({
  name: "record_provider_call",
  description: "Save how the provider call ended: the outcome, what the provider asked and any notes, in English. Call it once, before ending.",
  schema: z.object({
    outcome: z.enum(["eligibility_confirmed", "benefits_given", "gop_requested", "medical_update_logged", "claim_status_given", "invoice_change_logged", "callback_arranged", "escalated", "not_verified", "provider_unknown"]),
    provider_question: z.string().describe("What they called about, in a few English words"),
    notes: z.string().optional().describe("In English"),
  }),
  async execute(args, ctx) {
    // memberCall carries the outcome too, so the client's screens read every call the same way.
    await ctx.setOutcome({ providerCall: args as Prisma.InputJsonValue, memberCall: { outcome: args.outcome, member_question: args.provider_question, notes: args.notes ?? null } as Prisma.InputJsonValue });
    ctx.emit({ type: "provider_call", providerCall: args });
    return { saved: true };
  },
});

export const MSH_PROVIDER_TOOLS = [verifyFacilityTool, verifyPatientTool, lookupPatientForProviderTool, requestGuaranteeOfPaymentTool, logMedicalUpdateTool, logInvoiceChangeTool, recordProviderCallTool];
