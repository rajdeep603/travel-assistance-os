import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { crmCall, CrmUnavailable } from "./crm-connector";
import { defineTool, type ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Tools of the Centro Médico Puerta de Hierro call centre agent (a private
// hospital group in Guadalajara, Mexico: sites Andares, Sur and Colomos). The
// doctors' agendas, the appointments and the call log live in the hospital's
// own system, reached through crmCall (the brief's "_crm_url", signed like a
// webhook). Connector actions:
//   find_specialist        specialty + preferred day/site → open slots
//   book_appointment       a slot + the patient → the confirmation
//   record_caller_request  what the caller wanted, for the team's call log
//   hand_to_staff          a person on the team takes over
// ---------------------------------------------------------------------------

interface CmpdhBrief {
  client?: string;
  callback_promise?: string;
  _crm_url?: string;
  _collector_number?: string;
}

async function briefOf(ctx: ToolContext): Promise<CmpdhBrief> {
  const call = await prisma.call.findUnique({ where: { id: ctx.callId }, select: { outcome: true } });
  const outcome = (call?.outcome as Record<string, unknown> | null) ?? {};
  return (outcome.brief as CmpdhBrief | undefined) ?? {};
}

const SYSTEM_DOWN = "The hospital's scheduling system isn't answering just now.";

export const findSpecialistTool = defineTool({
  name: "find_specialist",
  description:
    "Search the hospital's own doctors' agendas for open appointment slots with a specialist. Returns up to a few options (slot id, doctor, specialty, site, when, languages the doctor speaks, whether the doctor accepts the caller's insurance). Offer at most two, the first first. Never offer a doctor or a time this tool did not return.",
  schema: z.object({
    specialty: z.string().describe("The specialty in English, e.g. 'orthopaedics and traumatology', 'cardiology', 'paediatrics', 'gynaecology', 'dermatology', 'internal medicine'"),
    reason: z.string().optional().describe("Why they want the appointment, in plain English as the caller said it, e.g. 'knee pain after a fall last week'. No diagnosis."),
    preferred_day: z.string().optional().describe("As the caller said it, in English, e.g. 'Thursday', 'tomorrow', 'next week', 'as soon as possible'"),
    part_of_day: z.enum(["morning", "afternoon", "any"]).optional(),
    site: z.string().optional().describe("Andares, Sur or Colomos, if they have a preference"),
    insurance: z.string().optional().describe("Their insurer if they have one, e.g. 'GNP', 'AXA', 'MetLife'"),
    doctor_name: z.string().optional().describe("Only if they ask for a doctor by name"),
  }),
  async execute(args, ctx) {
    const brief = await briefOf(ctx);
    try {
      const result = await crmCall<{ options?: Record<string, unknown>[]; note?: string; error?: string }>(brief._crm_url, ctx.callRef, "find_specialist", args);
      if (result.error || !result.options) return { error: `${result.error ?? "The search found nothing."} Ask which specialty or day suits them and try once more.` };
      await ctx.setOutcome({ cmpdhSearch: { specialty: args.specialty, preferred_day: args.preferred_day ?? null, site: args.site ?? null, options: result.options.map((o) => ({ slot_id: o.slot_id, doctor: o.doctor, when: o.when })) } as Prisma.InputJsonValue });
      ctx.emit({ type: "specialist_search", specialty: args.specialty, count: result.options.length });
      return result.options.length
        ? { ...result, say: "Offer the first option in one sentence (doctor, site, day and time, translated naturally into the call's language), and the second only if there is one, then ask which suits them." }
        : { ...result, say: "No open slot matches. Offer to look at another day or site, or to have the team call them back with an opening." };
    } catch (err) {
      if (!(err instanceof CrmUnavailable)) throw err;
      console.warn(`[cmpdh] ${ctx.callRef} find_specialist: ${err.message}`);
      return { error: `${SYSTEM_DOWN} Take their name and number and say the team will call them back today with an appointment; record the request.` };
    }
  },
});

export const bookHospitalAppointmentTool = defineTool({
  name: "book_hospital_appointment",
  description:
    "Book the slot the caller chose from find_specialist, in the hospital's system, once you have their full name and a phone number (and their date of birth if they gave it). Returns the confirmation: the reference, doctor, site, when and what to bring. Call it once per appointment, only after the caller said yes to the option.",
  schema: z.object({
    slot_id: z.string().describe("The slot_id from find_specialist of the option they chose"),
    patient_name: z.string().describe("The patient's full name as given (first name and surnames)"),
    phone: z.string().describe("The number to confirm the appointment to, as given"),
    date_of_birth: z.string().optional().describe("As given, e.g. '14 March 1981'"),
    insurance: z.string().optional().describe("Their insurer, or 'self-pay'"),
    reason: z.string().optional().describe("Why, in plain English as the caller said it. No diagnosis."),
    language: z.string().describe("The language the caller speaks, in English, e.g. 'Spanish'"),
  }),
  async execute(args, ctx) {
    const brief = await briefOf(ctx);
    try {
      const result = await crmCall<{ booked?: boolean; reference?: string; spoken?: string; doctor?: string; site?: string; when?: string; what_to_bring?: string | string[]; say?: string; error?: string }>(brief._crm_url, ctx.callRef, "book_appointment", args);
      if (!result.booked || !result.reference) return { booked: false, error: `${result.error ?? "That slot could not be booked."} Apologise, and offer the other option or another search.` };
      await ctx.setOutcome({ cmpdhBooking: { reference: result.reference, slot_id: args.slot_id, doctor: result.doctor ?? null, site: result.site ?? null, when: result.when ?? null, patient_name: args.patient_name } as Prisma.InputJsonValue });
      ctx.emit({ type: "appointment_booked", reference: result.reference });
      return {
        ...result,
        next: "Confirm it in one or two sentences: doctor, site, day and time, then read the reference slowly, letter by letter and digit by digit (as in 'spoken' if given), and say what to bring. A confirmation message goes to their phone.",
      };
    } catch (err) {
      if (!(err instanceof CrmUnavailable)) throw err;
      console.warn(`[cmpdh] ${ctx.callRef} book_appointment: ${err.message}`);
      return { booked: false, error: `${SYSTEM_DOWN} Say the team will confirm the appointment by phone today; record the request with the slot they chose.` };
    }
  },
});

export const recordCallerRequestTool = defineTool({
  name: "record_caller_request",
  description:
    "Save what the caller wanted for the hospital's call log, so the team sees every call: who, their number, the kind of request, a short summary in English, the urgency and any appointment reference. Call it once, before ending, on every call (also after a booking or a handover).",
  schema: z.object({
    caller_name: z.string().optional(),
    phone: z.string().optional(),
    language: z.string().describe("The language the caller spoke, in English"),
    request_type: z.enum(["appointment", "doctor_info", "results", "billing", "insurance", "complaint", "emergency", "other"]),
    summary: z.string().describe("Two or three sentences in English: who, what they asked, what was done or promised"),
    urgency: z.enum(["emergency", "urgent", "routine"]),
    reference: z.string().optional().describe("The appointment reference from book_hospital_appointment, if any"),
  }),
  async execute(args, ctx) {
    const brief = await briefOf(ctx);
    await ctx.setOutcome({ cmpdhRequest: args as Prisma.InputJsonValue });
    ctx.emit({ type: "caller_request", request: args });
    try {
      const result = await crmCall<{ reference?: string }>(brief._crm_url, ctx.callRef, "record_caller_request", args);
      return { saved: true, reference: result.reference ?? args.reference ?? null };
    } catch (err) {
      if (!(err instanceof CrmUnavailable)) throw err;
      console.warn(`[cmpdh] ${ctx.callRef} record_caller_request: ${err.message}`);
      return { saved: true, reference: args.reference ?? null };
    }
  },
});

export const handToStaffTool = defineTool({
  name: "hand_to_staff",
  description:
    "Pass the call to a person on the hospital's team: results, clinical questions, complaints, billing disputes, insurer authorisations, international patients, an emergency, or the caller asks for a person. Say what you are doing first. The summary is what the team reads before taking over.",
  schema: z.object({
    reason: z.enum(["asked_for_person", "emergency", "results", "clinical_question", "complaint", "billing", "insurance_authorisation", "international_patient", "cannot_help", "other"]),
    summary: z.string().describe("Two or three sentences in English: who, what they need, anything already done"),
  }),
  async execute(args, ctx) {
    const brief = await briefOf(ctx);
    await ctx.setOutcome({ handoff: { target: "staff", reason: args.reason, summary: args.summary, at: new Date().toISOString() } });
    ctx.emit({ type: "handoff", target: "staff", reason: args.reason, summary: args.summary });
    const fromSystem = await crmCall<{ say?: string }>(brief._crm_url, ctx.callRef, "hand_to_staff", args).catch(() => null);
    if (ctx.channel === "PHONE" && typeof brief._collector_number === "string" && brief._collector_number) {
      const result = await ctx.actions.transfer("collector", args.summary);
      if (result.ok) return { transferring: true, say: "Say you are connecting them to a member of the team now and that you have passed on a summary." };
      return { transferring: false, say: result.message };
    }
    const promise = brief.callback_promise ?? "a member of the team calls them back shortly";
    return {
      transferring: false,
      say: `${fromSystem?.say ?? `Say the team has the summary and that ${promise}; make sure you have their number, and thank them.`} Then make sure record_caller_request has been called and end the call with end_call: nobody will join this line.`,
    };
  },
});

export const CMPDH_TOOLS = [findSpecialistTool, bookHospitalAppointmentTool, recordCallerRequestTool, handToStaffTool];
