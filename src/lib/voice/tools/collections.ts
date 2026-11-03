import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAllowedNumber, normalizeNumber } from "@/lib/services/approved-numbers";
import { emailServiceFor } from "@/lib/services/email";
import { getTelephony } from "@/lib/services/telephony";
import { defineTool, type ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Tools of the collection agents (calls a debt-collection client places
// through the public API: a former patient about a hospital invoice, an
// insurer about a guarantee of payment, or the line debtors call in on).
//
// Identity is a gate, not a prompt rule: the debtor's date of birth and the
// debt itself travel in brief keys that start with "_", which the agent's
// instructions never print. The agent only learns the amount, the hospital
// and the treatment from verify_identity, after the person on the line has
// given the matching date of birth (and, inbound, the case reference).
// ---------------------------------------------------------------------------

interface CaseFacts {
  ref: string;
  debtor?: string;
  dob?: string | null;
  language?: string;
  hospital?: string;
  treatment?: string;
  amount?: number | string;
  balance?: number | string;
  currency?: string;
  status?: string;
  paused?: boolean;
  payment_link?: string;
  email?: string | null;
}

interface CollectionBrief {
  client?: string;
  case_ref?: string;
  calling?: string;
  payment_link?: string;
  email_on_file?: string | null;
  whatsapp_on_file?: string | null;
  documents_available?: { name: string; url: string }[];
  _identity?: { dob?: string | null; name?: string };
  _debt?: Record<string, unknown>;
  _cases?: CaseFacts[];
  _collector_number?: string;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** A spoken or written date → "YYYY-MM-DD", or null when it can't be read. */
export function parseDob(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ");
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(m[1], m[2], m[3]);
  m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return iso(m[3], m[2], m[1]);
  const month = (word: string) => MONTHS.findIndex((name) => name.startsWith(word.slice(0, 3)));
  m = s.match(/(\d{1,2})\s+(?:of\s+)?([a-z]+)\s+(\d{4})/);
  if (m && month(m[2]) >= 0) return iso(m[3], String(month(m[2]) + 1), m[1]);
  m = s.match(/([a-z]+)\s+(\d{1,2})\s+(\d{4})/);
  if (m && month(m[1]) >= 0) return iso(m[3], String(month(m[1]) + 1), m[2]);
  return null;
}

function iso(y: string, mo: string, d: string): string | null {
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (!(year >= 1900 && year <= 2030 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dobMatches(given: string | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected) return false;
  const a = parseDob(given);
  const b = parseDob(expected);
  return Boolean(a && b && a === b);
}

/** "GRA-24015", "GRA 24015", "two four zero one five" (digits already) → the case whose reference matches. */
export function findCase(cases: CaseFacts[], ref: string | undefined): CaseFacts | null {
  if (!ref) return null;
  const digits = ref.replace(/\D/g, "");
  if (!digits) return null;
  return cases.find((c) => c.ref.replace(/\D/g, "") === digits) ?? cases.find((c) => c.ref.replace(/\D/g, "").endsWith(digits) && digits.length >= 4) ?? null;
}

async function briefOf(ctx: ToolContext): Promise<{ brief: CollectionBrief; outcome: Record<string, unknown> }> {
  const call = await prisma.call.findUnique({ where: { id: ctx.callId }, select: { outcome: true } });
  const outcome = (call?.outcome as Record<string, unknown> | null) ?? {};
  return { brief: (outcome.brief as CollectionBrief | undefined) ?? {}, outcome };
}

/** The debt facts the agent may state once identity is confirmed. */
function debtFacts(brief: CollectionBrief, c?: CaseFacts | null): Record<string, unknown> {
  if (c) {
    const { dob: _dob, ...rest } = c;
    return rest;
  }
  return brief._debt ?? {};
}

export const verifyIdentityTool = defineTool({
  name: "verify_identity",
  description:
    "Check that the person on the line is the debtor before anything about the debt is said. Outbound: pass the date of birth they gave. Inbound: pass the case reference from their letter and the date of birth. Returns verified true with the case facts (hospital, treatment, amount, balance) you may then discuss, or verified false. After two failed attempts, apologise and end the call without mentioning any debt.",
  schema: z.object({
    date_of_birth: z.string().describe("As they said it, e.g. '14 March 1981' or '1981-03-14'"),
    case_ref: z.string().optional().describe("Inbound only: the case reference from the letter, e.g. GRA-24018"),
    name_given: z.string().optional().describe("The name they confirmed, if they said it"),
  }),
  async execute(args, ctx) {
    const { brief, outcome } = await briefOf(ctx);
    const previous = (outcome.identity as { attempts?: number } | undefined)?.attempts ?? 0;
    const attempts = previous + 1;
    let kase: CaseFacts | null = null;
    let expected: string | null | undefined;
    if (brief._cases?.length) {
      kase = findCase(brief._cases, args.case_ref);
      if (!kase) {
        await ctx.setOutcome({ identity: { verified: false, attempts, reason: "unknown case reference" } });
        return attempts >= 2
          ? { verified: false, say: "You can't find that reference. Apologise, suggest they call back with the letter to hand, and end the call. Say nothing about any debt." }
          : { verified: false, reason: "No case with that reference. Ask them to read the reference from the letter again, digit by digit." };
      }
      expected = kase.dob;
    } else {
      expected = brief._identity?.dob;
    }
    const verified = dobMatches(args.date_of_birth, expected);
    if (!verified) {
      await ctx.setOutcome({ identity: { verified: false, attempts, reason: "date of birth did not match" }, identityVerified: false });
      ctx.emit({ type: "identity", verified: false, attempts });
      return attempts >= 2
        ? { verified: false, say: "The date of birth doesn't match our record. Apologise, say you can't continue the call, and end it. Say nothing about any debt." }
        : { verified: false, reason: "That date of birth doesn't match. Ask them to repeat it once more, slowly." };
    }
    await ctx.setOutcome({ identity: { verified: true, attempts, case_ref: kase?.ref ?? brief.case_ref ?? null }, identityVerified: true });
    ctx.emit({ type: "identity", verified: true, caseRef: kase?.ref ?? brief.case_ref ?? null });
    return { verified: true, case: { ref: kase?.ref ?? brief.case_ref, ...debtFacts(brief, kase) } };
  },
});

const OUTCOMES = ["paid", "payment_plan_agreed", "promise_to_pay", "insurer_claimed", "dispute", "hardship_escalated", "wrong_person", "no_answer", "callback_requested", "do_not_call"] as const;

export const recordCollectionOutcomeTool = defineTool({
  name: "record_collection_outcome",
  description:
    "Save how the conversation ended: the outcome, any amount or instalment plan agreed, the promised date, an insurer named, a dispute, a call-back time, and the next action. Call it once, before ending, even when nothing was agreed (then say why in notes).",
  schema: z.object({
    outcome: z.enum(OUTCOMES),
    amount_agreed: z.string().optional().describe("e.g. '£1,000 per month' or '£3,200 in full'"),
    instalments: z
      .object({
        count: z.number().optional().describe("Number of payments"),
        amount: z.number().describe("Amount of each payment, plain number"),
        first_payment_date: z.string().describe("YYYY-MM-DD"),
      })
      .optional(),
    promise_date: z.string().optional().describe("YYYY-MM-DD, when they promised to pay"),
    insurer_name: z.string().optional(),
    policy_number: z.string().optional(),
    dispute_reason: z.string().optional().describe("In their words, briefly"),
    callback_time: z.string().optional(),
    next_action: z.string().optional().describe("What GRA should do next, e.g. 'check payment on 2026-11-16'"),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ collection: args as Prisma.InputJsonValue });
    ctx.emit({ type: "collection_outcome", collection: args });
    return { saved: true };
  },
});

export const sendPaymentLinkTool = defineTool({
  name: "send_payment_link",
  description:
    "Send the secure payment link and the agreed terms to the debtor by e-mail, WhatsApp or text message. Read the address or number back first. Only after identity is verified and terms are agreed.",
  schema: z.object({
    channel: z.enum(["email", "whatsapp", "sms"]),
    to: z.string().describe("E-mail address, or the mobile number in international format"),
  }),
  async execute(args, ctx) {
    const { brief, outcome } = await briefOf(ctx);
    if (!outcome.identityVerified) return { sent: false, reason: "Identity isn't verified yet. Verify it first." };
    const link = brief.payment_link ?? (brief._cases ? findCase(brief._cases, (outcome.identity as { case_ref?: string } | undefined)?.case_ref)?.payment_link : undefined);
    if (!link) return { sent: false, reason: "No payment link is on this call. Tell them it will be e-mailed by the team today." };
    const client = brief.client ?? "Global Recovery Alliance";
    const caseRef = (outcome.identity as { case_ref?: string } | undefined)?.case_ref ?? brief.case_ref ?? "";
    const plan = outcome.collection as { amount_agreed?: string; instalments?: { count?: number; amount?: number; first_payment_date?: string } } | undefined;
    const terms = plan?.instalments
      ? `Agreed: ${plan.instalments.count ? `${plan.instalments.count} payments of ` : ""}${plan.instalments.amount}${plan.instalments.count ? "" : " per month"}, the first on ${plan.instalments.first_payment_date}.`
      : plan?.amount_agreed
        ? `Agreed: ${plan.amount_agreed}.`
        : "";
    const text = `${client}: thank you for your time on the phone today. ${terms} Your secure payment link for ${caseRef}: ${link}`.replace(/\s+/g, " ").trim();
    let sent = false;
    let reason: string | null = null;
    let channel = args.channel;
    try {
      if (args.channel === "email") {
        const email = emailServiceFor(args.to);
        await email.send({ to: args.to, subject: `${client}: your payment link for ${caseRef}`, text: `${text}\n\nThe link is personal to your case. If anything on it is wrong, reply to this e-mail.`, fromName: `${client} (via CareTrail)` });
        sent = true;
      } else {
        const to = normalizeNumber(args.to);
        if (!(await isAllowedNumber(to))) reason = "That number isn't approved for messages on this demonstration platform.";
        else {
          const telephony = getTelephony();
          if (!telephony.configured) reason = "Messages aren't set up on this server.";
          else if (args.channel === "whatsapp") {
            try {
              await telephony.sendWhatsApp(to, text);
              sent = true;
            } catch {
              await telephony.sendSms(to, text);
              channel = "sms";
              sent = true;
            }
          } else {
            await telephony.sendSms(to, text);
            sent = true;
          }
        }
      }
    } catch (err) {
      reason = err instanceof Error ? err.message.slice(0, 200) : "sending failed";
    }
    await ctx.setOutcome({ paymentLinkSent: { channel, to: args.to, sent, reason } as Prisma.InputJsonValue });
    ctx.emit({ type: "payment_link", channel, to: args.to, sent });
    return sent
      ? { sent: true, channel, note: channel !== args.channel ? "WhatsApp wasn't available, so it went by text message; say so." : undefined }
      : { sent: false, reason: `${reason ?? "Sending failed."} Tell them the team will send it today and that you have noted the ${args.channel === "email" ? "address" : "number"}.` };
  },
});

export const handToCollectorTool = defineTool({
  name: "hand_to_collector",
  description:
    "Hand the case to a human collector: for a dispute, hardship, distress, signs of a vulnerable person, a request for a person, or anything you cannot settle. Say what you are doing first. The summary is what the collector reads (or hears) before taking over.",
  schema: z.object({
    reason: z.enum(["dispute", "hardship", "vulnerable_person", "asked_for_person", "do_not_call", "cannot_help", "other"]),
    summary: z.string().describe("Two or three sentences: who, what they said, what was agreed or not, what they want"),
  }),
  async execute(args, ctx) {
    const { brief } = await briefOf(ctx);
    await ctx.setOutcome({ handoff: { target: "collector", reason: args.reason, summary: args.summary, at: new Date().toISOString() } });
    ctx.emit({ type: "handoff", target: "collector", reason: args.reason, summary: args.summary });
    if (ctx.channel === "PHONE" && brief._collector_number) {
      const result = await ctx.actions.transfer("collector", args.summary);
      if (result.ok) return { transferring: true, say: "Say you are connecting them to a colleague now and that you have passed on the summary." };
      return { transferring: false, say: result.message };
    }
    return {
      transferring: false,
      say: "Tell them a collector has the summary and will call them back within two working days, nothing happens on the case until then, and thank them.",
    };
  },
});

export const recordGuaranteeStatusTool = defineTool({
  name: "record_guarantee_status",
  description: "Save what the insurer said about the guarantee of payment: approved, pending or declined, the claim reference, which documents are missing, the payment terms and the expected payment date. Call it once, before ending.",
  schema: z.object({
    guarantee_status: z.enum(["approved", "pending", "declined", "unknown"]),
    claim_ref: z.string().optional().describe("The insurer's claim number, e.g. 55-781"),
    missing_documents: z.array(z.string()).optional(),
    payment_terms: z.string().optional().describe("e.g. 'within 15 days of receiving the invoice'"),
    expected_payment_date: z.string().optional().describe("YYYY-MM-DD if they gave a date"),
    contact_name: z.string().optional(),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ guarantee: args as Prisma.InputJsonValue });
    ctx.emit({ type: "guarantee_status", guarantee: args });
    return { saved: true };
  },
});

export const sendDocumentTool = defineTool({
  name: "send_document",
  description: "E-mail the insurer one of the documents in the brief (e.g. the itemised invoice) as a secure link. Confirm the address by reading it back first.",
  schema: z.object({
    document: z.string().describe("The document's name as listed in the brief"),
    to: z.string().describe("E-mail address"),
  }),
  async execute(args, ctx) {
    const { brief } = await briefOf(ctx);
    const wanted = args.document.toLowerCase();
    const doc = (brief.documents_available ?? []).find((d) => d.name.toLowerCase() === wanted) ?? (brief.documents_available ?? []).find((d) => wanted.includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(wanted));
    if (!doc) return { sent: false, reason: `No such document on this call. Available: ${(brief.documents_available ?? []).map((d) => d.name).join(", ") || "none"}.` };
    const client = brief.client ?? "Global Recovery Alliance";
    let sent = false;
    let reason: string | null = null;
    try {
      await emailServiceFor(args.to).send({
        to: args.to,
        subject: `${client}: ${doc.name} for ${brief.case_ref ?? "your claim"}`,
        text: `As discussed on the phone, here is the ${doc.name} for ${brief.case_ref ?? "the claim"}: ${doc.url}\n\nPlease let us know the expected payment date once it has been processed.\n\n${client}`,
        fromName: `${client} (via CareTrail)`,
      });
      sent = true;
    } catch (err) {
      reason = err instanceof Error ? err.message.slice(0, 200) : "sending failed";
    }
    await ctx.setOutcome({ documentSent: { document: doc.name, to: args.to, sent, reason } as Prisma.InputJsonValue });
    ctx.emit({ type: "document_sent", document: doc.name, to: args.to, sent });
    return sent ? { sent: true } : { sent: false, reason: `${reason ?? "Sending failed."} Say the team will send it today.` };
  },
});

export const COLLECTION_TOOLS = [verifyIdentityTool, recordCollectionOutcomeTool, sendPaymentLinkTool, handToCollectorTool, recordGuaranteeStatusTool, sendDocumentTool];
