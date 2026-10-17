import type { GuaranteeLetter, Prisma } from "@prisma/client";
import { z } from "zod";
import { gatewaySecret, signToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { spokenDate } from "./booking";
import { agentActor } from "./records";
import { defineTool, type ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Tools for hospitals and clinics calling about a guarantee of payment.
// A caller proves they're treating the patient with the patient's full name
// and date of birth (or the letter reference and surname), and only hears
// about letters issued to their own hospital.
// ---------------------------------------------------------------------------

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Edit distance, for names the recogniser spelled slightly wrong. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/**
 * Every word of the record's name appears in what was said ("Lena Koch" ⊂
 * "Mrs Lena Marie Koch"), allowing one wrong letter in longer words: speech
 * recognition hears "Lena" as "Lina". Always used with the date of birth.
 */
export function nameMatches(said: string, first: string, last: string): boolean {
  const words = fold(said);
  return [...fold(first).slice(0, 1), ...fold(last)].every((w) => words.some((s) => s === w || (w.length >= 4 && distance(s, w) <= 1)));
}

/** The caller's hospital and the letter's share a distinctive word ("Marmara"). */
const GENERIC = new Set(["demo", "hospital", "hastanesi", "hastane", "medical", "center", "centre", "clinic", "klinik", "private", "ozel", "international", "the", "of", "and", "heart", "health", "group", "tip", "merkezi"]);
export function hospitalMatches(said: string, letterHospital: string): boolean {
  const theirs = fold(said).filter((w) => !GENERIC.has(w) && w.length > 2);
  const ours = new Set(fold(letterHospital));
  return theirs.length === 0 || theirs.some((w) => ours.has(w));
}

function statusInWords(l: GuaranteeLetter): string {
  const day = (d: Date | null) => (d ? spokenDate(d.toISOString().slice(0, 10)) : "");
  switch (l.status) {
    case "DRAFT":
      return "being reviewed by a case manager; not issued yet";
    case "APPROVED":
      return "approved and about to be sent";
    case "SENT":
      return `sent by ${l.sentVia === "EMAIL" ? "e-mail" : "fax"} on ${day(l.sentAt)}${l.sentTo && l.sentVia === "EMAIL" ? ` to ${l.sentTo}` : ""}; receipt not confirmed yet`;
    case "ACKNOWLEDGED":
      return `sent on ${day(l.sentAt)}; your hospital confirmed receipt${l.acknowledgedAt ? ` on ${day(l.acknowledgedAt)}` : ""}`;
    case "REJECTED":
      return "not approved; the case manager will contact the hospital";
  }
}

/**
 * Re-sending renders the PDF when it's missing, which only the app can do
 * (pdfkit stays out of the gateway bundle, and stored files live with the
 * app), so the gateway asks the app. In-process (tests, the probe) it runs here.
 */
async function resend(letterId: string, by: string): Promise<{ via: "FAX" | "EMAIL"; to: string }> {
  if (!env.appInternalUrl) {
    const { resendLetter } = await import("@/lib/services/guarantee-letter");
    return resendLetter(letterId, by);
  }
  const token = await signToken({ kind: "gateway-resend", letterId, by }, gatewaySecret(), 60);
  const res = await fetch(`${env.appInternalUrl}/api/internal/guarantee-letters/${encodeURIComponent(letterId)}/resend`, {
    method: "POST",
    headers: { "x-gateway-token": token },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as { sent?: { via: "FAX" | "EMAIL"; to: string }; error?: { message?: string } } | null;
  if (!res.ok || !body?.sent) throw new ApiError(body?.error?.message ?? "The letter couldn't be re-sent.", res.status || 502, "RESEND_FAILED");
  return body.sent;
}

async function letterOnCall(ref: string, ctx: ToolContext) {
  if (!ctx.caseId) return { error: "Look the guarantee up with find_guarantee first." };
  const letter = await prisma.guaranteeLetter.findFirst({ where: { ref: ref.toUpperCase().replace(/\s+/g, ""), caseId: ctx.caseId } });
  return letter ?? { error: `${ref} isn't one of the letters found on this call.` };
}

export const findGuaranteeTool = defineTool({
  name: "find_guarantee",
  description:
    "Find the guarantee of payment (Letter of Guarantee) for a patient at the caller's hospital: status, guaranteed amount, excess, validity and conditions. Needs the caller's hospital and either the patient's full name and date of birth, or the letter reference (LOG-…) and the patient's surname.",
  schema: z.object({
    hospital: z.string().describe("The caller's hospital or clinic"),
    patient_name: z.string().describe("Patient's name as the caller gave it (surname at least)"),
    date_of_birth: z.string().optional().describe("Patient's date of birth as YYYY-MM-DD"),
    letter_ref: z.string().optional().describe("e.g. LOG-0902, if the caller has it"),
  }),
  async execute(args, ctx) {
    const ref = args.letter_ref?.toUpperCase().replace(/\s+/g, "").replace(/^LOG(\d)/, "LOG-$1");
    const dob = args.date_of_birth && /^\d{4}-\d{2}-\d{2}$/.test(args.date_of_birth) ? new Date(`${args.date_of_birth}T00:00:00Z`) : null;
    if (!ref && !dob) {
      return { found: false, say: "Ask for the patient's date of birth, or the guarantee reference if they have it." };
    }
    const letters = await prisma.guaranteeLetter.findMany({
      where: ref ? { ref } : { case: { patient: { dateOfBirth: dob ?? undefined } } },
      include: { case: { include: { patient: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const forPatient = letters.filter((l) =>
      ref
        ? fold(args.patient_name).some((w) => fold(l.case.patient.lastName).includes(w))
        : nameMatches(args.patient_name, l.case.patient.firstName, l.case.patient.lastName)
    );
    const ours = forPatient.filter((l) => hospitalMatches(args.hospital, l.hospitalName));
    if (forPatient.length === 0) {
      return { found: false, say: "No guarantee matches those details. Ask them to check the spelling, the date of birth or the reference; offer a case manager call-back." };
    }
    if (ours.length === 0) {
      return { found: false, say: "There is no guarantee on file for this patient at the caller's hospital. Don't say whether one exists elsewhere; offer to take their cost estimate so a case manager can issue one." };
    }
    const kase = ours[0].case;
    await ctx.setCase(kase.id, kase.patientId);
    await ctx.setOutcome({ guaranteeEnquiry: { hospital: args.hospital, letters: ours.map((l) => l.ref) } });
    ctx.emit({ type: "guarantee_found", letters: ours.map((l) => ({ ref: l.ref, status: l.status, amount: Number(l.guaranteedAmount), currency: l.currency })) });
    return {
      found: true,
      case_ref: kase.ref,
      patient: `${kase.patient.firstName} ${kase.patient.lastName}`,
      letters: ours.map((l) => ({
        ref: l.ref,
        hospital: l.hospitalName,
        status: statusInWords(l),
        guaranteed_amount: `${Number(l.guaranteedAmount).toLocaleString("en-GB")} ${l.currency}`,
        excess: Number(l.excess) > 0 ? `${Number(l.excess).toLocaleString("en-GB")} ${l.currency}, payable by the patient` : "none",
        valid_until: spokenDate(l.validUntil.toISOString().slice(0, 10)),
        conditions: l.conditions,
      })),
      billing: "Invoice the assistance company directly, quoting the guarantee reference; anything above the guaranteed amount needs a top-up first.",
    };
  },
});

export const resendGuaranteeTool = defineTool({
  name: "resend_guarantee",
  description:
    "Send a guarantee letter found on this call again, to the hospital's fax (or e-mail) on file. Never send to a number or address the caller dictates.",
  schema: z.object({ letter_ref: z.string().describe("e.g. LOG-0902") }),
  async execute(args, ctx) {
    const letter = await letterOnCall(args.letter_ref, ctx);
    if ("error" in letter) return letter;
    const sent = await resend(letter.id, agentActor(ctx));
    await ctx.setOutcome({ guaranteeResent: { ref: letter.ref, via: sent.via } });
    ctx.emit({ type: "guarantee_resent", ref: letter.ref, via: sent.via });
    return {
      sent: true,
      say:
        sent.via === "FAX"
          ? `Re-sent by fax to the hospital's fax number on file, ending in ${sent.to.replace(/\D/g, "").slice(-4).split("").join(" ")}.`
          : `Re-sent by e-mail to ${sent.to}, the hospital's address on file.`,
    };
  },
});

export const requestGuaranteeIncreaseTool = defineTool({
  name: "request_guarantee_increase",
  description:
    "Record that the hospital needs a higher guarantee (a top-up) because treatment will cost more than guaranteed. A case manager decides; never promise the increase.",
  schema: z.object({
    letter_ref: z.string().describe("The guarantee to increase, e.g. LOG-0902"),
    new_estimated_total: z.number().describe("The hospital's new estimated total for the whole stay"),
    currency: z.string().describe("ISO code, e.g. EUR, TRY"),
    reason: z.string().describe("Why, in English: e.g. 'stent placement added', 'two more nights in ICU'"),
    extra_days: z.number().optional(),
  }),
  async execute(args, ctx) {
    const letter = await letterOnCall(args.letter_ref, ctx);
    if ("error" in letter) return letter;
    const current = Number(letter.guaranteedAmount);
    const request = { ...args, letter_ref: letter.ref, current_amount: current, current_currency: letter.currency, callRef: ctx.callRef };
    await prisma.caseEvent.create({
      data: {
        caseId: letter.caseId,
        type: "LETTER_OF_GUARANTEE",
        title: `${letter.hospitalName} asks to raise ${letter.ref}: ${current.toLocaleString("en-GB")} → ${args.new_estimated_total.toLocaleString("en-GB")} ${args.currency}`,
        body: `${args.reason}${args.extra_days ? `; ${args.extra_days} more day${args.extra_days === 1 ? "" : "s"}` : ""}. Requested on ${ctx.callRef}; send an updated cost estimate to draft the top-up.`,
        data: request as Prisma.InputJsonValue,
        actor: agentActor(ctx),
      },
    });
    await prisma.case.update({ where: { id: letter.caseId }, data: { status: "PENDING_INFO" } });
    await ctx.setOutcome({ topUpRequest: request });
    ctx.emit({ type: "topup_requested", ref: letter.ref, amount: args.new_estimated_total, currency: args.currency });
    return {
      recorded: true,
      say: "Tell them a case manager reviews the increase today, and ask them to fax or e-mail the updated cost estimate so the new letter can be drafted. Don't promise the amount.",
    };
  },
});
