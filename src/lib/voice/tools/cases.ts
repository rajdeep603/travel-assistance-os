import { z } from "zod";
import { prisma } from "@/lib/db";
import { retrieveContext } from "@/lib/services/assistant";
import { matchSymptoms } from "@/lib/services/nlu";
import { MODE_LABELS } from "@/lib/services/transport";
import { utcToZoned } from "@/lib/time";
import { spokenDate } from "./booking";
import { nameMatches } from "./provider";
import { agentActor, createCaseRecord, resolvePatient } from "./records";
import { defineTool, type ToolContext } from "./types";

export const createCaseTool = defineTool({
  name: "create_case",
  description:
    "Open an assistance case when the caller needs follow-up but not (yet) an appointment — e.g. an emergency, a hospital admission, or a request for a call back. If the call already has a case, adds the details to it instead. Returns the case reference.",
  schema: z.object({
    patient_name: z.string().optional(),
    contact: z.string().optional(),
    policy_number: z.string().optional(),
    location: z.string().describe("Where the traveller is"),
    issue: z.string().describe("The medical problem or request in a few words"),
    urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    assistance_type: z
      .enum(["MEDICAL", "DENTAL", "HOSPITALIZATION", "EVACUATION", "REPATRIATION", "GENERAL"])
      .optional(),
    summary: z.string().describe("2-3 sentence summary for the human case manager"),
  }),
  async execute(args, ctx) {
    if (ctx.caseId) {
      const kase = await prisma.case.update({
        where: { id: ctx.caseId },
        data: {
          priority: args.urgency,
          events: {
            create: {
              type: "NOTE",
              title: `Update from ${ctx.callRef}: ${args.issue}`,
              body: args.summary,
              actor: agentActor(ctx),
            },
          },
        },
        select: { id: true, ref: true },
      });
      await ctx.setOutcome({ caseRef: kase.ref, urgency: args.urgency, issue: args.issue, location: args.location });
      ctx.emit({ type: "case", case: { id: kase.id, ref: kase.ref }, updated: true });
      return { case_ref: kase.ref, updated_existing: true };
    }

    const { kase, patient } = await prisma.$transaction(async (tx) => {
      const patient = await resolvePatient(tx, ctx, {
        name: args.patient_name,
        contact: args.contact,
        policyNumber: args.policy_number,
      });
      const kase = await createCaseRecord(
        tx,
        patient.id,
        {
          title: `${args.issue} — ${args.location}`,
          description: `Voice intake (${ctx.callRef}): ${args.issue}`,
          location: args.location,
          symptoms: matchSymptoms(args.issue).map((r) => r.symptom),
          priority: args.urgency,
          assistanceType: args.assistance_type,
          summary: args.summary,
        },
        agentActor(ctx)
      );
      return { kase, patient };
    });
    await ctx.setCase(kase.id, patient.id);
    await ctx.setOutcome({ caseRef: kase.ref, urgency: args.urgency, issue: args.issue, location: args.location });
    ctx.emit({ type: "case", case: { id: kase.id, ref: kase.ref }, priority: args.urgency });
    return { case_ref: kase.ref };
  },
});

export const addCaseNoteTool = defineTool({
  name: "add_case_note",
  description: "Record a fact the case manager must see (e.g. allergies, hotel, a callback time) on this call's case.",
  schema: z.object({ note: z.string().max(1000) }),
  async execute(args, ctx) {
    if (!ctx.caseId) return { error: "This call has no case yet. Create one first (create_case)." };
    await prisma.caseEvent.create({
      data: { caseId: ctx.caseId, type: "NOTE", title: `Note from ${ctx.callRef}`, body: args.note, actor: agentActor(ctx) },
    });
    return { saved: true };
  },
});

const GUARANTEE_IN_WORDS: Record<string, string> = {
  DRAFT: "being prepared for the hospital",
  APPROVED: "approved and about to go to the hospital",
  SENT: "sent to the hospital",
  ACKNOWLEDGED: "received by the hospital, so treatment can go ahead without a deposit",
  REJECTED: "under discussion with a case manager",
};

/** Everything a "where is my case?" caller may hear about their case. */
async function caseStatus(caseId: string, ctx: ToolContext) {
  const kase = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      appointments: {
        where: { status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: "asc" },
        take: 1,
        include: { provider: true },
      },
      guaranteeLetters: { orderBy: { createdAt: "desc" }, take: 1 },
      claims: { orderBy: { createdAt: "desc" }, take: 1 },
      transportPlans: { orderBy: { createdAt: "desc" }, take: 1 },
      events: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  // File this call on the case, so the update shows on its timeline.
  if (!ctx.caseId) await ctx.setCase(kase.id, kase.patientId);
  await ctx.setOutcome({ statusGiven: { caseRef: kase.ref } });
  const next = kase.appointments[0];
  const slot = next ? utcToZoned(next.scheduledAt) : null;
  const letter = kase.guaranteeLetters[0];
  const claim = kase.claims[0];
  const plan = kase.transportPlans[0];
  const last = kase.events[0] ? utcToZoned(kase.events[0].createdAt) : null;
  const issues = (Array.isArray(claim?.issues) ? claim.issues : []) as { severity?: string; message?: string }[];
  return {
    found: true,
    case_ref: kase.ref,
    status: kase.status.replace(/_/g, " ").toLowerCase(),
    priority: kase.priority.toLowerCase(),
    case_manager_assigned: Boolean(kase.assignedTo),
    next_appointment: next && slot
      ? { ref: next.ref, when: `${spokenDate(slot.date)} at ${slot.time}`, doctor: next.provider.name, facility: next.provider.facility }
      : null,
    guarantee_of_payment: letter ? `${letter.hospitalName}: ${GUARANTEE_IN_WORDS[letter.status]}` : null,
    claim: claim
      ? { ref: claim.ref, status: claim.status.replace(/_/g, " ").toLowerCase(), still_needed: issues.filter((i) => i.severity === "error").map((i) => i.message) }
      : null,
    transport_home: plan ? `${MODE_LABELS[plan.mode]} (${plan.status === "BOOKED" ? "booked" : "being arranged"})` : null,
    last_update: last ? `${spokenDate(last.date)} at ${last.time}` : null,
  };
}

export const getCaseStatusTool = defineTool({
  name: "get_case_status",
  description:
    "Look up a case by its reference (e.g. CASE-1024): status, next appointment, guarantee of payment, claim and transport home. Without a reference, use find_my_case. Share status-level information only.",
  schema: z.object({ case_ref: z.string().describe("e.g. CASE-1024") }),
  async execute(args, ctx) {
    const ref = args.case_ref.toUpperCase().replace(/\s+/g, "").replace(/^CASE(\d)/, "CASE-$1");
    const kase = await prisma.case.findUnique({ where: { ref }, select: { id: true } });
    if (!kase) return { found: false, message: `No case ${ref} was found. Ask the caller to check the reference, or use find_my_case with their name and date of birth.` };
    return caseStatus(kase.id, ctx);
  },
});

export const findMyCaseTool = defineTool({
  name: "find_my_case",
  description:
    "Answer \"where is my case?\" when the caller has no case reference: finds their latest case from their name and date of birth, and returns its status, next appointment, guarantee of payment, claim and transport home.",
  schema: z.object({
    full_name: z.string().describe("The caller's first and last name"),
    date_of_birth: z.string().describe("The caller's date of birth as YYYY-MM-DD"),
  }),
  async execute(args, ctx) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date_of_birth)) return { found: false, message: "Give date_of_birth as YYYY-MM-DD." };
    const candidates = await prisma.patient.findMany({ where: { dateOfBirth: new Date(`${args.date_of_birth}T00:00:00Z`) } });
    const patient = candidates.find((p) => nameMatches(args.full_name, p.firstName, p.lastName));
    // Their open case if they have one, else the latest.
    const kase = patient
      ? ((await prisma.case.findFirst({ where: { patientId: patient.id, status: { notIn: ["RESOLVED", "CLOSED"] } }, orderBy: { updatedAt: "desc" }, select: { id: true } })) ??
        (await prisma.case.findFirst({ where: { patientId: patient.id }, orderBy: { updatedAt: "desc" }, select: { id: true } })))
      : null;
    if (!kase) {
      return { found: false, message: "No case matches that name and date of birth. Read both back to the caller to check them, or ask for the case reference (CASE-…); otherwise offer a case manager call-back." };
    }
    return caseStatus(kase.id, ctx);
  },
});

export const getClaimStatusTool = defineTool({
  name: "get_claim_status",
  description: "Look up a claim by reference (e.g. CLM-10245): status and any missing documents the claimant must send.",
  schema: z.object({ claim_ref: z.string().describe("e.g. CLM-10245") }),
  async execute(args) {
    const ref = args.claim_ref.toUpperCase().replace(/\s+/g, "").replace(/^CLM(\d)/, "CLM-$1");
    const claim = await prisma.claim.findUnique({ where: { ref } });
    if (!claim) return { found: false, message: `No claim ${ref} was found. Ask the caller to check the reference.` };
    const issues = (Array.isArray(claim.issues) ? claim.issues : []) as { severity?: string; message?: string }[];
    return {
      found: true,
      claim_ref: claim.ref,
      status: claim.status.replace(/_/g, " ").toLowerCase(),
      amount: claim.amount != null ? `${Number(claim.amount)} ${claim.currency ?? ""}`.trim() : null,
      outstanding: issues.filter((i) => i.severity === "error").map((i) => i.message),
    };
  },
});

export const searchKnowledgeTool = defineTool({
  name: "search_knowledge",
  description:
    "Search the company's operational knowledge base (policies, coverage rules, procedures). Use it before answering any question about what is covered or how a process works; answer only from what it returns.",
  schema: z.object({ query: z.string() }),
  async execute(args) {
    const chunks = await retrieveContext(args.query, 3);
    if (chunks.length === 0) {
      return { results: [], advice: "Nothing relevant found. Say you'll have a case manager confirm." };
    }
    return {
      results: chunks.map((c) => ({ source: c.title, excerpt: c.content.slice(0, 900) })),
    };
  },
});
