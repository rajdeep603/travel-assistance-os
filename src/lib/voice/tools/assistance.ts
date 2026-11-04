import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { agentActor } from "./records";
import { defineTool, type ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Tools of the agents added after ITIC 2026 (what assistance companies and
// their partners asked for): the coverage check with an insurer before
// treatment, the field emergency intake, the receiving hospital's acceptance
// for a medical transport, and the call-back to a caller the desk missed.
// Each one files what it learned on the case timeline and on the call.
// ---------------------------------------------------------------------------

async function fileOnCase(ctx: ToolContext, title: string, body: string, data?: Record<string, unknown>) {
  if (!ctx.caseId) return;
  await prisma.caseEvent
    .create({ data: { caseId: ctx.caseId, type: "CALL", title, body, actor: agentActor(ctx), ...(data ? { data: data as Prisma.InputJsonValue } : {}) } })
    .catch((err) => console.error(`[voice] ${ctx.callRef} could not file on the case:`, err));
}

export const recordBenefitVerificationTool = defineTool({
  name: "record_benefit_verification",
  description:
    "Save what the insurer's desk confirmed about the patient's cover: whether the policy is active, whether the planned treatment is covered, the limit and excess, whether a guarantee of payment or pre-authorisation is needed and its reference, where to send documents, and who you spoke to. Call it once, before ending.",
  schema: z.object({
    policy_active: z.boolean().nullable().describe("null if they could not confirm"),
    treatment_covered: z.enum(["YES", "NO", "PARTIAL", "UNKNOWN"]),
    limit: z.number().optional().describe("Benefit limit, plain number"),
    excess: z.number().optional().describe("Excess or deductible, plain number"),
    currency: z.string().optional().describe("ISO code"),
    preauthorisation_required: z.boolean().nullable().optional(),
    guarantee_reference: z.string().optional().describe("The GOP or pre-authorisation reference they gave"),
    expected_within: z.string().optional().describe("When the guarantee will be issued, e.g. 'within 2 hours'"),
    exclusions: z.array(z.string()).optional().describe("What is not covered, in their words"),
    send_documents_to: z.string().optional().describe("E-mail or fax for the medical report and the guarantee request"),
    contact_name: z.string().optional(),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ benefitVerification: args as Prisma.InputJsonValue });
    ctx.emit({ type: "benefit_verification", verification: args });
    const money = args.limit != null ? ` Limit ${args.limit}${args.currency ? ` ${args.currency}` : ""}${args.excess != null ? `, excess ${args.excess}` : ""}.` : "";
    await fileOnCase(
      ctx,
      `Cover verified with the insurer on ${ctx.callRef}: ${args.treatment_covered === "YES" ? "covered" : args.treatment_covered === "NO" ? "not covered" : args.treatment_covered === "PARTIAL" ? "partly covered" : "not confirmed"}`,
      `Policy ${args.policy_active === true ? "active" : args.policy_active === false ? "NOT active" : "status not confirmed"}.${money}${args.preauthorisation_required ? ` Pre-authorisation required${args.guarantee_reference ? `: ${args.guarantee_reference}` : ""}${args.expected_within ? `, ${args.expected_within}` : ""}.` : args.guarantee_reference ? ` Reference ${args.guarantee_reference}.` : ""}${args.exclusions?.length ? ` Excluded: ${args.exclusions.join(", ")}.` : ""}${args.send_documents_to ? ` Documents to ${args.send_documents_to}.` : ""}${args.contact_name ? ` Spoke to ${args.contact_name}.` : ""}${args.notes ? ` ${args.notes}` : ""}`,
      { verification: args }
    );
    return { saved: true };
  },
});

export const recordEmergencyIntakeTool = defineTool({
  name: "record_emergency_intake",
  description:
    "Save the field emergency intake: where the person is (place, nearest town, GPS or altitude if given), who and how many, the condition and symptoms, whether anyone is in immediate danger, what help is needed (doctor, ground ambulance, helicopter or evacuation), the group or policy, and how to reach the caller. Call it as soon as you have the location and the condition, then again if anything important changes.",
  schema: z.object({
    location: z.string().describe("Place and nearest town, as said"),
    gps_or_altitude: z.string().optional().describe("GPS coordinates or altitude in metres, if the caller has them"),
    patient_name: z.string().optional(),
    patient_age: z.number().optional(),
    people_affected: z.number().optional().describe("How many people need help"),
    condition: z.string().describe("Symptoms and what happened, in English"),
    immediate_danger: z.boolean().describe("Unconscious, not breathing, severe bleeding, unable to move, worsening fast"),
    help_needed: z.enum(["ADVICE", "DOCTOR", "GROUND_AMBULANCE", "HELICOPTER", "EVACUATION", "UNKNOWN"]),
    can_move: z.boolean().nullable().optional().describe("Can the patient walk or be moved to a road or clearing"),
    weather_and_access: z.string().optional().describe("Weather, daylight, road or helipad access"),
    group_or_policy: z.string().optional().describe("Tour operator, group name or policy number"),
    callback_number: z.string().optional(),
    battery_or_signal: z.string().optional().describe("How long the caller can stay reachable"),
    local_emergency_called: z.boolean().nullable().optional(),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ emergencyIntake: args as Prisma.InputJsonValue });
    ctx.emit({ type: "emergency_intake", intake: args });
    await fileOnCase(
      ctx,
      `Emergency intake on ${ctx.callRef}: ${args.help_needed.toLowerCase().replace(/_/g, " ")} needed at ${args.location}`,
      `${args.condition}${args.immediate_danger ? " IMMEDIATE DANGER." : ""}${args.people_affected ? ` ${args.people_affected} affected.` : ""}${args.gps_or_altitude ? ` Position: ${args.gps_or_altitude}.` : ""}${args.can_move === false ? " Cannot be moved without help." : ""}${args.weather_and_access ? ` Access: ${args.weather_and_access}.` : ""}${args.group_or_policy ? ` ${args.group_or_policy}.` : ""}${args.callback_number ? ` Call back ${args.callback_number}.` : ""}${args.battery_or_signal ? ` Reachable: ${args.battery_or_signal}.` : ""}`,
      { intake: args }
    );
    return {
      saved: true,
      next:
        args.immediate_danger || ["HELICOPTER", "EVACUATION"].includes(args.help_needed)
          ? "Tell the caller the assistance doctor is being connected now and to keep the line open; then transfer_to_human with target doctor."
          : "Tell the caller a doctor will call them back within fifteen minutes on the number you noted, and what to do meanwhile (keep warm, don't move the injured limb, no climbing higher).",
    };
  },
});

export const recordBedAcceptanceTool = defineTool({
  name: "record_bed_acceptance",
  description:
    "Save the receiving hospital's answer for the incoming patient: whether they accept, the ward or ICU bed, the accepting physician, the documents they need before arrival, where the ambulance should arrive and whom to call, and the earliest admission time. Call it once, before ending.",
  schema: z.object({
    accepted: z.enum(["YES", "NO", "PENDING"]),
    bed_type: z.enum(["ICU", "HDU", "WARD", "NONE", "UNKNOWN"]).optional(),
    accepting_physician: z.string().optional(),
    department: z.string().optional(),
    earliest_admission: z.string().optional().describe("Day and time they can admit, as said"),
    documents_needed: z.array(z.string()).optional().describe("e.g. medical report, guarantee of payment, imaging"),
    arrival_instructions: z.string().optional().describe("Entrance, bed-to-bed hand-over point, parking for the ambulance"),
    contact_name: z.string().optional(),
    contact_number: z.string().optional(),
    reason_if_declined: z.string().optional(),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ bedAcceptance: args as Prisma.InputJsonValue });
    ctx.emit({ type: "bed_acceptance", acceptance: args });
    await fileOnCase(
      ctx,
      `Receiving hospital ${args.accepted === "YES" ? "accepts the patient" : args.accepted === "NO" ? "declined" : "is still deciding"} (${ctx.callRef})`,
      `${args.bed_type && args.bed_type !== "UNKNOWN" ? `${args.bed_type} bed. ` : ""}${args.accepting_physician ? `Accepting physician ${args.accepting_physician}${args.department ? `, ${args.department}` : ""}. ` : ""}${args.earliest_admission ? `Admission from ${args.earliest_admission}. ` : ""}${args.documents_needed?.length ? `Needs: ${args.documents_needed.join(", ")}. ` : ""}${args.arrival_instructions ? `Arrival: ${args.arrival_instructions}. ` : ""}${args.contact_name || args.contact_number ? `Contact ${[args.contact_name, args.contact_number].filter(Boolean).join(" ")}. ` : ""}${args.reason_if_declined ? `Declined: ${args.reason_if_declined}. ` : ""}${args.notes ?? ""}`.trim(),
      { acceptance: args }
    );
    return { saved: true };
  },
});

export const recordCallbackOutcomeTool = defineTool({
  name: "record_callback_outcome",
  description: "Save how the call-back went: whether you reached the caller, what they needed, what was done on this call, and what is still open for the desk. Call it once, before ending.",
  schema: z.object({
    reached: z.boolean(),
    need: z.string().optional().describe("What they were calling about, in a few words"),
    resolved: z.boolean().describe("Their need was handled on this call"),
    next_action: z.string().optional().describe("What the desk still has to do, with a time if agreed"),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ callback: args as Prisma.InputJsonValue });
    ctx.emit({ type: "callback_outcome", callback: args });
    await fileOnCase(ctx, `Missed call returned on ${ctx.callRef}: ${args.reached ? (args.resolved ? "resolved" : "open") : "not reached"}`, `${args.need ?? ""}${args.next_action ? ` Next: ${args.next_action}.` : ""}${args.notes ? ` ${args.notes}` : ""}`.trim(), { callback: args });
    return { saved: true };
  },
});

export const ASSISTANCE_TOOLS = [recordBenefitVerificationTool, recordEmergencyIntakeTool, recordBedAcceptanceTool, recordCallbackOutcomeTool];
