import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { defineTool, type ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Tools of the telehealth contact-centre agents (the EverHealth POC): the
// eligibility and benefits call to the insurer and the patient line. Results
// go into Call.outcome, which the client app receives with call.completed.
// ---------------------------------------------------------------------------

async function briefOf(ctx: ToolContext): Promise<Record<string, unknown>> {
  const call = await prisma.call.findUnique({ where: { id: ctx.callId }, select: { outcome: true } });
  const outcome = (call?.outcome as Record<string, unknown> | null) ?? {};
  return (outcome.brief as Record<string, unknown> | undefined) ?? {};
}

const yesNoUnknown = z.enum(["YES", "NO", "PARTIAL", "UNKNOWN"]);

export const recordBenefitCheckTool = defineTool({
  name: "record_benefit_check",
  description:
    "Save what the insurer's representative confirmed about the patient's eligibility and benefits: coverage active, plan, network status, one entry per procedure code (covered, co-pay or co-insurance, pre-authorisation), deductible and out-of-pocket figures, how to request a pre-authorisation, the call reference and who you spoke to. Call it once, before ending.",
  schema: z.object({
    status: z.enum(["verified", "partly_verified", "refused", "no_answer", "wrong_number"]).describe("wrong_number when it isn't the insurer in the brief; refused when they would not discuss benefits"),
    coverage_active: z.boolean().nullable().optional().describe("null if they could not confirm"),
    plan_name: z.string().optional(),
    network_status: z.enum(["IN_NETWORK", "OUT_OF_NETWORK", "UNKNOWN"]).optional(),
    telehealth_covered: yesNoUnknown.optional(),
    services: z
      .array(
        z.object({
          code: z.string().describe("The procedure code as in the brief, e.g. 99213"),
          covered: yesNoUnknown,
          copay: z.number().optional().describe("Co-pay, plain number"),
          coinsurance_pct: z.number().optional().describe("Co-insurance percentage the patient pays, e.g. 20"),
          preauth_required: z.boolean().nullable().optional(),
          notes: z.string().optional().describe("Limits, frequency, conditions, in their words"),
        })
      )
      .optional(),
    deductible: z.number().optional(),
    deductible_met: z.number().optional(),
    oop_max: z.number().optional().describe("Out-of-pocket maximum"),
    oop_met: z.number().optional(),
    currency: z.string().optional().describe("ISO code, e.g. USD or MXN"),
    preauth_how: z.string().optional().describe("How to request a pre-authorisation: phone, portal or fax, and the turnaround"),
    reference_number: z.string().optional().describe("The reference number the representative gave for this call"),
    contact_name: z.string().optional(),
    reason: z.string().optional().describe("Why they refused or could not verify, in their words"),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ benefitCheck: args as Prisma.InputJsonValue });
    ctx.emit({ type: "benefit_check", benefitCheck: args });
    return { saved: true };
  },
});

export const recordPatientRequestTool = defineTool({
  name: "record_patient_request",
  description:
    "Save the patient's request for the care team: who, where they are, what is wrong and since when, urgency, what they need (video consultation, doctor call-back, visit, prescription, information), the policy if given, and how to reach them. In English. Call it as soon as you have the essentials, and again if something important changes.",
  schema: z.object({
    patient_name: z.string().optional(),
    location: z.string().optional().describe("City and hotel or address, as said"),
    complaint: z.string().describe("What is wrong, in the caller's own words (translated to English)"),
    since: z.string().optional().describe("Since when"),
    already_taken: z.string().optional().describe("Medication or remedies already taken"),
    urgency: z.enum(["emergency", "urgent", "routine"]),
    need: z.enum(["video_consultation", "doctor_callback", "visit", "prescription", "information", "other"]),
    policy: z.string().optional().describe("Insurer and policy number, if given"),
    callback_number: z.string().optional(),
    caller_language: z.string().optional().describe("The language the caller spoke, in English (German, French…)"),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ patientRequest: args as Prisma.InputJsonValue });
    ctx.emit({ type: "patient_request", patientRequest: args });
    return { saved: true, reference: ctx.callRef };
  },
});

export const handToCareTeamTool = defineTool({
  name: "hand_to_care_team",
  description:
    "Hand the call to a person on the care team: the caller asks for a person, has red-flag symptoms, is distressed, or needs something you cannot do. Say what you are doing first. The summary is what the care team reads or hears before taking over.",
  schema: z.object({
    reason: z.enum(["asked_for_person", "emergency", "medical_question", "complaint", "cannot_help", "other"]),
    summary: z.string().describe("Two or three sentences: who, where, what they need"),
  }),
  async execute(args, ctx) {
    const brief = await briefOf(ctx);
    await ctx.setOutcome({ handoff: { target: "care_team", reason: args.reason, summary: args.summary, at: new Date().toISOString() } });
    ctx.emit({ type: "handoff", target: "care_team", reason: args.reason, summary: args.summary });
    if (ctx.channel === "PHONE" && typeof brief._collector_number === "string" && brief._collector_number) {
      const result = await ctx.actions.transfer("collector", args.summary);
      if (result.ok) return { transferring: true, say: "Say you are connecting them to a member of the care team now and that you have passed on a summary." };
      return { transferring: false, say: result.message };
    }
    return { transferring: false, say: "Say the care team has the summary and will contact them on the number they gave very shortly, and thank them." };
  },
});

export const TELEHEALTH_TOOLS = [recordBenefitCheckTool, recordPatientRequestTool, handToCareTeamTool];
