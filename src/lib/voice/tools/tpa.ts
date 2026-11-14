import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { emailServiceFor } from "@/lib/services/email";
import { dobMatches } from "./collections";
import { defineTool, type ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Tools of the claims-administration agents (a TPA's calls placed through
// the public API: the member line, the call to the treating provider for
// documents, the call to the payer about an invoice). The member's date of
// birth and the claim facts travel in brief keys that start with "_", which
// the instructions never print: verify_member is the only way to them.
// ---------------------------------------------------------------------------

interface ClaimFacts {
  ref: string;
  member?: string;
  dob?: string | null;
  [key: string]: unknown;
}

interface TpaBrief {
  client?: string;
  /** What a call-back promise sounds like for this client ("a member services agent calls back within one business hour"). */
  callback_promise?: string;
  claim_ref?: string;
  upload_link?: string;
  patient?: string;
  _cases?: ClaimFacts[];
  _collector_number?: string;
}

async function briefOf(ctx: ToolContext): Promise<{ brief: TpaBrief; outcome: Record<string, unknown> }> {
  const call = await prisma.call.findUnique({ where: { id: ctx.callId }, select: { outcome: true } });
  const outcome = (call?.outcome as Record<string, unknown> | null) ?? {};
  return { brief: (outcome.brief as TpaBrief | undefined) ?? {}, outcome };
}

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !["mr", "mrs", "ms", "dr", "miss"].includes(w));

const NUMBER_WORDS: Record<string, string> = { zero: "0", oh: "0", o: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };

/** "G E M two four zero three one eight" → "240318": digits, and number words read out one by one. */
export function refDigits(ref: string | undefined): string {
  if (!ref) return "";
  return ref
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => (/^\d+$/.test(t) ? t : NUMBER_WORDS[t] ?? ""))
    .join("");
}

/** The claim by its reference (digits as heard), else by the member's surname (a phone line garbles names: up to two letters off). */
export function findClaim(claims: ClaimFacts[], ref?: string, name?: string): ClaimFacts | null {
  const digits = refDigits(ref);
  if (digits.length >= 4) {
    const hit = claims.find((c) => c.ref.replace(/\D/g, "") === digits) ?? claims.find((c) => c.ref.replace(/\D/g, "").endsWith(digits));
    if (hit) return hit;
  }
  if (name) {
    const given = words(name);
    const surname = given[given.length - 1];
    if (!surname) return null;
    const matches = claims.filter((c) => {
      const theirs = words(c.member ?? "");
      const last = theirs[theirs.length - 1] ?? "";
      return last === surname || (last.length >= 5 && editDistance(last, surname) <= 2) || theirs.join("") === given.join("");
    });
    if (matches.length === 1) return matches[0];
  }
  return null;
}

export const verifyMemberTool = defineTool({
  name: "verify_member",
  description:
    "Check that the caller is the member before anything about a claim is said. Pass the date of birth they gave and the claim number if they have it, otherwise their full name. Returns verified true with the claim's status and facts you may then share, or verified false with what to do. After two failed attempts, apologise and offer a case manager call-back; say nothing about any claim.",
  schema: z.object({
    date_of_birth: z.string().describe("As they said it, e.g. '3 November 1978'"),
    claim_ref: z.string().optional().describe("The claim number from their e-mail or letter, e.g. GEM-240318"),
    member_name: z.string().optional().describe("Their full name, when they have no claim number"),
  }),
  async execute(args, ctx) {
    const { brief, outcome } = await briefOf(ctx);
    const attempts = ((outcome.identity as { attempts?: number } | undefined)?.attempts ?? 0) + 1;
    const claim = findClaim(brief._cases ?? [], args.claim_ref, args.member_name);
    if (!claim) {
      await ctx.setOutcome({ identity: { verified: false, attempts, reason: "claim not found" }, identityVerified: false });
      return attempts >= 2
        ? { verified: false, say: "You can't find the claim. Apologise, offer a call-back from a case manager (take their number), and say nothing about any claim." }
        : { verified: false, reason: "No claim matches. Ask for the claim number from their e-mail or letter, digit by digit, or their full name spelled out." };
    }
    if (!dobMatches(args.date_of_birth, claim.dob ?? null)) {
      await ctx.setOutcome({ identity: { verified: false, attempts, reason: "date of birth did not match" }, identityVerified: false });
      ctx.emit({ type: "identity", verified: false, attempts });
      return attempts >= 2
        ? { verified: false, say: "The details don't match our records. Apologise, say a case manager can help if they call back with their claim e-mail to hand, and say nothing about any claim." }
        : { verified: false, reason: "That date of birth doesn't match. Ask them to repeat it once more, slowly." };
    }
    await ctx.setOutcome({ identity: { verified: true, attempts, case_ref: claim.ref }, identityVerified: true });
    ctx.emit({ type: "identity", verified: true, caseRef: claim.ref });
    const facts: Record<string, unknown> = { ...claim };
    delete facts.dob;
    return { verified: true, claim: facts };
  },
});

export const recordMemberCallTool = defineTool({
  name: "record_member_call",
  description: "Save how the member call ended: the outcome, what the member asked, any call-back time agreed. Call it once, before ending.",
  schema: z.object({
    outcome: z.enum(["status_given", "benefits_given", "case_opened", "callback_requested", "escalated", "not_verified", "wrong_person", "no_answer"]),
    member_question: z.string().optional().describe("What they wanted to know, in a few words"),
    callback_time: z.string().optional().describe("When a case manager should call back, as agreed"),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ memberCall: args as Prisma.InputJsonValue });
    ctx.emit({ type: "member_call", memberCall: args });
    return { saved: true };
  },
});

export const recordDocumentRequestTool = defineTool({
  name: "record_document_request",
  description:
    "Save what the provider said about the documents: which were requested, whether they will send them, how and by when (a date they confirmed), who you spoke to, and any condition (for example a signed authorisation). Call it once, before ending.",
  schema: z.object({
    outcome: z.enum(["documents_promised", "documents_refused", "already_sent", "wrong_number", "no_answer"]).describe("wrong_number when it isn't the hospital in the brief"),
    documents_requested: z.array(z.string()).describe("The documents you asked for, as named in the brief"),
    will_send_by: z.string().optional().describe("upload link, e-mail or fax"),
    expected_by: z.string().optional().describe("YYYY-MM-DD, the date they confirmed"),
    contact_name: z.string().optional(),
    contact_role: z.string().optional(),
    send_to: z.string().optional().describe("Where they will send them, if not the upload link"),
    notes: z.string().optional().describe("Conditions, e.g. 'needs the patient's signed authorisation'"),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ documentRequest: args as Prisma.InputJsonValue });
    ctx.emit({ type: "document_request", documentRequest: args });
    return { saved: true };
  },
});

export const sendUploadLinkTool = defineTool({
  name: "send_provider_upload_link",
  description: "E-mail the provider the secure upload link from the brief, where they can upload the documents for this claim. Read the address back to them first.",
  schema: z.object({ to: z.string().describe("E-mail address") }),
  async execute(args, ctx) {
    const { brief } = await briefOf(ctx);
    if (!brief.upload_link) return { sent: false, reason: "No upload link on this call. Say the team will e-mail it today." };
    const client = brief.client ?? "Global Excel";
    let sent = false;
    let reason: string | null = null;
    try {
      await emailServiceFor(args.to).send({
        to: args.to,
        subject: `${client}: secure upload for claim ${brief.claim_ref ?? ""}${brief.patient ? ` (${brief.patient.split(",")[0]})` : ""}`.trim(),
        text: `Thank you for your time on the phone.\n\nPlease upload the documents for claim ${brief.claim_ref ?? ""} here: ${brief.upload_link}\n\nThe link is specific to this claim and works on a phone or a computer. Each file is confirmed as soon as it arrives.\n\n${client} Claims Assistant`,
        fromName: `${client} Claims Assistant`,
      });
      sent = true;
    } catch (err) {
      reason = err instanceof Error ? err.message.slice(0, 200) : "sending failed";
    }
    await ctx.setOutcome({ uploadLinkSent: { channel: "email", to: args.to, sent, reason } as Prisma.InputJsonValue });
    ctx.emit({ type: "upload_link", to: args.to, sent });
    return sent ? { sent: true } : { sent: false, reason: `${reason ?? "Sending failed."} Say the team will e-mail it today.` };
  },
});

export const recordInvoiceFollowupTool = defineTool({
  name: "record_invoice_followup",
  description:
    "Save what the payer said about the invoice: its status, the payment date, the remittance reference if paid, what is missing, the reason if rejected, and who you spoke to. Call it once, before ending.",
  schema: z.object({
    status: z.enum(["received", "in_review", "approved", "scheduled", "paid", "rejected", "missing_info", "not_found", "wrong_number"]).describe("wrong_number when it isn't the payer in the brief"),
    payment_date: z.string().optional().describe("YYYY-MM-DD, scheduled or actual"),
    amount: z.number().optional(),
    currency: z.string().optional(),
    remittance_ref: z.string().optional(),
    missing: z.array(z.string()).optional().describe("Documents or information they need"),
    reason: z.string().optional().describe("Why it is rejected or held, in their words"),
    contact_name: z.string().optional(),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ invoiceFollowup: args as Prisma.InputJsonValue });
    ctx.emit({ type: "invoice_followup", invoiceFollowup: args });
    return { saved: true };
  },
});

export const handToCaseManagerTool = defineTool({
  name: "hand_to_case_manager",
  description:
    "Hand the call to a case manager of the company you answer for: the caller asks for a person, disputes something, is distressed, or needs a decision you cannot make. Say what you are doing first. The summary is what the case manager reads or hears before taking over.",
  schema: z.object({
    reason: z.enum(["asked_for_person", "dispute", "medical_question", "complaint", "cannot_help", "other"]),
    summary: z.string().describe("Two or three sentences: who, which claim, what they want"),
  }),
  async execute(args, ctx) {
    const { brief } = await briefOf(ctx);
    await ctx.setOutcome({ handoff: { target: "case_manager", reason: args.reason, summary: args.summary, at: new Date().toISOString() } });
    ctx.emit({ type: "handoff", target: "case_manager", reason: args.reason, summary: args.summary });
    if (ctx.channel === "PHONE" && brief._collector_number) {
      const result = await ctx.actions.transfer("collector", args.summary);
      if (result.ok) return { transferring: true, say: "Say you are connecting them to a case manager now and that you have passed on a summary." };
      return { transferring: false, say: result.message };
    }
    return { transferring: false, say: brief.callback_promise ? `Say a case manager has the summary and that ${brief.callback_promise}; take their phone number if you don't have it, and thank them.` : "Say a case manager has the summary and will call them back within one working day, and thank them." };
  },
});

export const TPA_TOOLS = [verifyMemberTool, recordMemberCallTool, recordDocumentRequestTool, sendUploadLinkTool, recordInvoiceFollowupTool, handToCaseManagerTool];
