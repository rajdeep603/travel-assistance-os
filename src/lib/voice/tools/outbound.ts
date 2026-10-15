import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getTelephony } from "@/lib/services/telephony";
import { claimUploadUrl } from "@/lib/upload-links";
import { agentActor } from "./records";
import { defineTool, type ToolContext } from "./types";

function needCase(ctx: ToolContext): string | { error: string } {
  return ctx.caseId ?? { error: "This call isn't linked to a case." };
}

export const recordHospitalUpdateTool = defineTool({
  name: "record_hospital_update",
  description:
    "Save what the hospital told you to the case: admission status, ward, attending doctor, estimated cost, when the medical report will be ready. Write values in English; amounts as plain numbers.",
  schema: z.object({
    admitted: z.boolean().nullable().describe("Is the patient admitted? null if unknown"),
    ward: z.string().optional(),
    attending_doctor: z.string().optional(),
    estimated_cost: z.number().optional().describe("Estimated total cost of treatment"),
    currency: z.string().optional().describe("ISO code, e.g. TRY, EUR"),
    report_eta: z.string().optional().describe("When the medical report/epicrisis will be ready"),
    guarantee_requested: z.boolean().optional().describe("The hospital asked for a Letter of Guarantee"),
    condition_note: z.string().optional().describe("Anything said about the patient's condition"),
  }),
  async execute(args, ctx) {
    const caseId = needCase(ctx);
    if (typeof caseId !== "string") return caseId;
    const parts = [
      args.admitted == null ? "Admission status unknown" : args.admitted ? "Admitted" : "Not admitted",
      args.ward ? `ward ${args.ward}` : null,
      args.attending_doctor ? `attending ${args.attending_doctor}` : null,
      args.estimated_cost != null ? `estimated cost ${args.estimated_cost.toLocaleString("en-GB")} ${args.currency ?? ""}`.trim() : null,
      args.report_eta ? `report ${args.report_eta}` : null,
      args.guarantee_requested ? "hospital requests a Letter of Guarantee" : null,
    ].filter(Boolean);
    await prisma.caseEvent.create({
      data: {
        caseId,
        type: "NOTE",
        title: `Hospital update from ${ctx.callRef}`,
        body: `${parts.join(", ")}.${args.condition_note ? ` Condition: ${args.condition_note}` : ""}`,
        data: args as Prisma.InputJsonValue,
        actor: agentActor(ctx),
      },
    });
    if (args.admitted) {
      await prisma.case.update({ where: { id: caseId }, data: { assistanceType: "HOSPITALIZATION" } });
    }
    await ctx.setOutcome({ hospitalUpdate: args });
    ctx.emit({ type: "hospital_update", update: args });
    return { saved: true };
  },
});

export const recordFollowupTool = defineTool({
  name: "record_followup",
  description: "Save the result of a wellbeing follow-up call to the case.",
  schema: z.object({
    attended: z.boolean().nullable().describe("Did the visit/treatment happen?"),
    status: z.enum(["better", "same", "worse"]).describe("How the traveller feels compared with before"),
    new_symptoms: z.string().optional(),
    needs: z.string().optional().describe("Anything they still need (follow-up visit, medication, travel help)"),
  }),
  async execute(args, ctx) {
    const caseId = needCase(ctx);
    if (typeof caseId !== "string") return caseId;
    await prisma.caseEvent.create({
      data: {
        caseId,
        type: "NOTE",
        title: `Follow-up call ${ctx.callRef}: traveller feels ${args.status}`,
        body: [
          args.attended == null ? null : args.attended ? "Visit attended." : "Visit not attended.",
          args.new_symptoms ? `New symptoms: ${args.new_symptoms}.` : null,
          args.needs ? `Needs: ${args.needs}.` : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
        data: args as Prisma.InputJsonValue,
        actor: agentActor(ctx),
      },
    });
    if (args.status === "worse") {
      await prisma.case.update({ where: { id: caseId }, data: { priority: "HIGH", status: "ESCALATED" } });
    } else if (args.status === "better" && !args.needs) {
      await prisma.case.update({ where: { id: caseId }, data: { status: "RESOLVED" } });
    }
    await ctx.setOutcome({ followup: args });
    return { saved: true, ...(args.status === "worse" ? { next: "Escalate: transfer_to_human with target doctor." } : {}) };
  },
});

export const confirmAppointmentTool = defineTool({
  name: "confirm_appointment",
  description: "Record that the traveller confirmed they will attend the appointment.",
  schema: z.object({ appointment_ref: z.string() }),
  async execute(args, ctx) {
    const caseId = needCase(ctx);
    if (typeof caseId !== "string") return caseId;
    const apt = await prisma.appointment.findFirst({ where: { ref: args.appointment_ref.toUpperCase(), caseId } });
    if (!apt) return { error: "That appointment isn't on this case." };
    await prisma.$transaction([
      prisma.appointment.update({ where: { id: apt.id }, data: { status: "CONFIRMED" } }),
      prisma.caseEvent.create({
        data: { caseId, type: "APPOINTMENT", title: `Traveller confirmed ${apt.ref}`, body: `Confirmed on reminder call ${ctx.callRef}.`, actor: agentActor(ctx) },
      }),
    ]);
    await ctx.setOutcome({ confirmed: apt.ref });
    return { confirmed: true };
  },
});

export const cancelAppointmentTool = defineTool({
  name: "cancel_appointment",
  description: "Cancel one of this case's appointments, with the traveller's explicit agreement (e.g. after rebooking).",
  schema: z.object({ appointment_ref: z.string(), reason: z.string(), caller_confirmed: z.boolean() }),
  async execute(args, ctx) {
    if (!args.caller_confirmed) return { error: "Ask the traveller to confirm the cancellation first." };
    const caseId = needCase(ctx);
    if (typeof caseId !== "string") return caseId;
    const apt = await prisma.appointment.findFirst({ where: { ref: args.appointment_ref.toUpperCase(), caseId } });
    if (!apt) return { error: "That appointment isn't on this case." };
    await prisma.$transaction([
      prisma.appointment.update({ where: { id: apt.id }, data: { status: "CANCELLED", notes: `Cancelled on ${ctx.callRef}: ${args.reason}` } }),
      prisma.caseEvent.create({
        data: { caseId, type: "APPOINTMENT", title: `${apt.ref} cancelled`, body: args.reason, actor: agentActor(ctx) },
      }),
    ]);
    await ctx.setOutcome({ cancelled: apt.ref });
    return { cancelled: true };
  },
});

export const sendUploadLinkTool = defineTool({
  name: "send_upload_link",
  description:
    "Text the claimant a secure link to upload the missing claim documents (valid 7 days). Use the phone number on file unless they confirm another one.",
  schema: z.object({
    phone: z.string().optional().describe("E.164 number to text, only if different from the one on file"),
  }),
  async execute(args, ctx) {
    const caseId = needCase(ctx);
    if (typeof caseId !== "string") return caseId;
    const kase = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      include: { patient: true, claims: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const claim = kase.claims[0];
    if (!claim) return { error: "There's no claim on this case to upload documents to." };
    const to = (args.phone ?? kase.patient.phone).replace(/[^\d+]/g, "");
    const url = await claimUploadUrl(claim.id);
    const telephony = getTelephony();
    let sent = false;
    if (telephony.configured && /^\+\d{8,15}$/.test(to)) {
      try {
        await telephony.sendSms(to, `Travel Assistance (demo): upload the documents for claim ${claim.ref} here: ${url} (valid 7 days)`);
        sent = true;
      } catch (err) {
        console.warn(`[voice] SMS for ${claim.ref} failed:`, err instanceof Error ? err.message : err);
      }
    }
    await prisma.caseEvent.create({
      data: {
        caseId,
        type: "CLAIM",
        title: sent ? `Upload link for ${claim.ref} sent by SMS` : `Upload link for ${claim.ref} created (SMS not sent)`,
        body: sent ? `Sent to ${to.slice(0, 3)}•••${to.slice(-4)} during ${ctx.callRef}.` : `Share it with the claimant: ${url}`,
        actor: agentActor(ctx),
      },
    });
    await ctx.setOutcome({ uploadLink: { claim: claim.ref, sent } });
    ctx.emit({ type: "upload_link", claim: claim.ref, sent });
    return sent
      ? { sent: true, say: "The link is on its way by text message." }
      : { sent: false, say: "Text messages aren't available right now; a case manager will e-mail the link today." };
  },
});

export const confirmLogReceiptTool = defineTool({
  name: "confirm_log_receipt",
  description: "Record whether the hospital received the Letter of Guarantee (and anything they asked for).",
  schema: z.object({
    letter_ref: z.string().describe("e.g. LOG-1001"),
    received: z.boolean(),
    notes: z.string().optional().describe("Anything the hospital said (e.g. 'admission confirmed for tomorrow 08:00')"),
  }),
  async execute(args, ctx) {
    const caseId = needCase(ctx);
    if (typeof caseId !== "string") return caseId;
    const letter = await prisma.guaranteeLetter.findFirst({ where: { ref: args.letter_ref.toUpperCase(), caseId } });
    if (!letter) return { error: "That letter isn't on this case." };
    if (args.received) {
      const { acknowledgeLetter } = await import("@/lib/services/guarantee-status");
      await acknowledgeLetter(letter.id, `agent:${ctx.profileId}`, args.notes).catch(() => undefined);
    } else {
      await prisma.caseEvent.create({
        data: {
          caseId,
          type: "LETTER_OF_GUARANTEE",
          title: `${letter.hospitalName} has NOT received ${letter.ref} — resend needed`,
          body: args.notes ?? null,
          actor: agentActor(ctx),
        },
      });
    }
    await ctx.setOutcome({ letterReceipt: { ref: letter.ref, received: args.received } });
    return { saved: true };
  },
});
