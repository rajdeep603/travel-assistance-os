import { z } from "zod";
import { recordAgreement, reviewToNegotiate } from "@/lib/services/bill-negotiation";
import { recordPayerAnswer } from "@/lib/services/receivables";
import { createTransportPlan } from "@/lib/services/transport-plans";
import { MODE_LABELS } from "@/lib/services/transport";
import { agentActor } from "./records";
import { defineTool } from "./types";

// Tools for calls about money and logistics: agreeing a reviewed bill with a
// hospital, and assessing a patient for medical transport home.

export const recordBillAgreementTool = defineTool({
  name: "record_bill_agreement",
  description:
    "Save the hospital billing office's answer about the reviewed invoice: AGREED (with the agreed amount and whether the patient is held harmless), COUNTER_OFFER, REFUSED or CALLBACK. Call it once, before ending.",
  schema: z.object({
    outcome: z.enum(["AGREED", "COUNTER_OFFER", "REFUSED", "CALLBACK"]),
    agreed_amount: z.number().optional().describe("The amount the hospital accepts as full payment"),
    counter_amount: z.number().optional().describe("The hospital's counter-offer, if any"),
    hold_harmless: z.boolean().describe("The hospital confirmed it will not bill the patient for the difference"),
    contact_name: z.string().optional().describe("Who you spoke to in billing"),
    notes: z.string().optional().describe("Anything else they said, in English"),
  }),
  async execute(args, ctx) {
    if (!ctx.caseId) return { error: "This call isn't linked to a case." };
    const review = await reviewToNegotiate(ctx.caseId);
    if (!review) return { error: "There is no reviewed invoice on this case." };
    const { outcome, note } = await recordAgreement(
      review.id,
      {
        outcome: args.outcome,
        agreedAmount: args.agreed_amount ?? null,
        counterAmount: args.counter_amount ?? null,
        holdHarmless: args.hold_harmless,
        contact: args.contact_name ?? null,
        notes: args.notes ?? null,
        callRef: ctx.callRef,
      },
      agentActor(ctx)
    );
    await ctx.setOutcome({
      billAgreement: { outcome, amount: args.agreed_amount ?? args.counter_amount ?? null, currency: review.currency, holdHarmless: args.hold_harmless },
    });
    ctx.emit({ type: "bill_agreement", outcome, amount: args.agreed_amount ?? args.counter_amount ?? null, currency: review.currency });
    return outcome === "AGREED"
      ? { saved: true, outcome, say: "Thank them, confirm the agreed amount and that they'll send a corrected invoice, then end the call." }
      : { saved: true, outcome, say: `${note ? `${note} ` : ""}Tell them a case manager will be in touch today about the amount, thank them and end the call.` };
  },
});

export const recordTransportAssessmentTool = defineTool({
  name: "record_transport_assessment",
  description:
    "Save the treating doctor's assessment for transporting the patient home. The system recommends the transport mode and requests quotes; tell the doctor the next step, not costs.",
  schema: z.object({
    diagnosis: z.string().describe("Current diagnosis, in English"),
    fit_to_fly: z
      .enum(["NOW", "FROM_DATE", "NOT_YET"])
      .describe("NOW; FROM_DATE when the doctor gives a day (plan the transport for it); NOT_YET when they can't say"),
    fit_from: z.string().optional().describe("The day the doctor expects the patient to be fit to fly, e.g. 'Monday 19 October'"),
    mobility: z.enum(["SEATED", "WHEELCHAIR", "STRETCHER"]),
    oxygen_lpm: z.number().describe("Supplemental oxygen in litres per minute; 0 if none"),
    monitoring: z.enum(["NONE", "BASIC", "CONTINUOUS"]).describe("Cardiac/vital-sign monitoring or IV needed during transport"),
    intensive_care: z.boolean().describe("Needs intensive care (ventilation, ICU) during transport"),
    escort: z.enum(["NONE", "NURSE", "DOCTOR"]).describe("The escort the doctor recommends"),
    destination: z.string().optional().describe("Where the patient goes: city or hospital at home"),
    notes: z.string().optional(),
  }),
  async execute(args, ctx) {
    if (!ctx.caseId) return { error: "This call isn't linked to a case." };
    const { plan, quotesFrom } = await createTransportPlan(
      ctx.caseId,
      {
        diagnosis: args.diagnosis,
        fitToFly: args.fit_to_fly !== "NOT_YET",
        fitFrom: args.fit_from ?? null,
        mobility: args.mobility,
        oxygenLpm: args.oxygen_lpm,
        monitoring: args.monitoring,
        intensiveCare: args.intensive_care,
        escort: args.escort,
        destination: args.destination ?? null,
        notes: args.notes ?? null,
      },
      { callRef: ctx.callRef, by: agentActor(ctx) }
    );
    await ctx.setOutcome({ transportPlan: { ref: plan.ref, mode: plan.mode } });
    ctx.emit({ type: "transport_plan", ref: plan.ref, mode: plan.mode, label: MODE_LABELS[plan.mode] });
    return {
      saved: true,
      plan_ref: plan.ref,
      recommended: MODE_LABELS[plan.mode],
      next_step:
        plan.mode === "NOT_FIT_TO_FLY"
          ? "Ask the doctor to let the assistance team know when the patient is fit to fly; the case manager will call again then."
          : `The case manager arranges ${MODE_LABELS[plan.mode].toLowerCase()}${quotesFrom.length ? " and has requested quotes" : ""}. Ask the hospital to prepare the medical report and, for an airline, the MEDIF form.`,
    };
  },
});

export const recordPaymentStatusTool = defineTool({
  name: "record_payment_status",
  description:
    "Save what the payer's claims or accounts desk said about the invoice: whether they have it, its status, the expected payment date, the amount approved and anything missing. Call it once, before ending.",
  schema: z.object({
    invoice_ref: z.string().describe("The invoice's reference from the brief, e.g. RCV-1003"),
    status: z.enum(["NOT_RECEIVED", "IN_REVIEW", "APPROVED", "PAYMENT_SCHEDULED", "PAID", "DISPUTED"]),
    expected_payment_date: z.string().optional().describe("When they said it will be paid, e.g. '6 November'"),
    approved_amount: z.number().optional().describe("The amount they approved, if they said"),
    missing_documents: z.array(z.string()).optional().describe("Documents they say are missing, in English"),
    payer_reference: z.string().optional().describe("Their own claim or file number"),
    contact_name: z.string().optional().describe("Who you spoke to"),
    notes: z.string().optional().describe("Anything else, in English"),
  }),
  async execute(args, ctx) {
    const updated = await recordPayerAnswer(
      args.invoice_ref,
      {
        status: args.status,
        expectedPaymentDate: args.expected_payment_date ?? null,
        approvedAmount: args.approved_amount ?? null,
        missing: args.missing_documents ?? [],
        payerRef: args.payer_reference ?? null,
        contact: args.contact_name ?? null,
        notes: args.notes ?? null,
      },
      agentActor(ctx),
      ctx.callRef
    ).catch(() => null);
    if (!updated) return { error: `No invoice ${args.invoice_ref}. Use the reference in the brief.` };
    await ctx.setOutcome({ paymentStatus: { invoice: updated.ref, status: args.status, expectedPaymentDate: args.expected_payment_date ?? null, missing: args.missing_documents ?? [] } });
    ctx.emit({ type: "payment_status", invoice: updated.ref, status: args.status, expectedPaymentDate: args.expected_payment_date ?? null });
    return args.missing_documents?.length
      ? { saved: true, say: "Confirm you'll send the missing documents today, thank them and end the call." }
      : { saved: true, say: "Repeat the expected payment date back, thank them and end the call." };
  },
});
