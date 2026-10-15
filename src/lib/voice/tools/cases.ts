import { z } from "zod";
import { prisma } from "@/lib/db";
import { retrieveContext } from "@/lib/services/assistant";
import { matchSymptoms } from "@/lib/services/nlu";
import { utcToZoned } from "@/lib/time";
import { spokenDate } from "./booking";
import { agentActor, createCaseRecord, resolvePatient } from "./records";
import { defineTool } from "./types";

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
    await ctx.setOutcome({ caseRef: kase.ref, urgency: args.urgency });
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

export const getCaseStatusTool = defineTool({
  name: "get_case_status",
  description:
    "Look up an existing case by reference (e.g. CASE-1024): status, priority, next appointment. Share only status-level information with the caller.",
  schema: z.object({ case_ref: z.string().describe("e.g. CASE-1024") }),
  async execute(args) {
    const ref = args.case_ref.toUpperCase().replace(/\s+/g, "").replace(/^CASE(\d)/, "CASE-$1");
    const kase = await prisma.case.findUnique({
      where: { ref },
      include: {
        appointments: {
          where: { status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { gte: new Date() } },
          orderBy: { scheduledAt: "asc" },
          take: 1,
          include: { provider: true },
        },
      },
    });
    if (!kase) return { found: false, message: `No case ${ref} was found. Ask the caller to check the reference.` };
    const next = kase.appointments[0];
    const slot = next ? utcToZoned(next.scheduledAt) : null;
    return {
      found: true,
      case_ref: kase.ref,
      status: kase.status.replace(/_/g, " ").toLowerCase(),
      priority: kase.priority.toLowerCase(),
      case_manager_assigned: Boolean(kase.assignedTo),
      next_appointment: next && slot
        ? { ref: next.ref, when: `${spokenDate(slot.date)} at ${slot.time}`, doctor: next.provider.name, facility: next.provider.facility }
        : null,
    };
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
