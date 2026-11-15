import type { DemoPortal, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAgent } from "@/lib/voice/agents/registry";
import type { ChatMessage } from "@/lib/services/types";
import { BENEFIT_MEMBERS, BENEFIT_PLANS, BENEFIT_PROVIDERS, ensureBenefitRecords, type BenefitRecords } from "./benefit-records";
import { PORTAL_PLACED_BY } from "./portal";

// ---------------------------------------------------------------------------
// What the portal shows from the records: a session's result (transcript,
// summary, case, what the CRM receives), the guarantee scenario's run, the
// knowledge the agents work from. Only records of this portal's sessions and
// of the kit's own case are ever returned.
// ---------------------------------------------------------------------------

/** The kit's records (created if missing). One kit today. */
export async function kitRecords(kit: string): Promise<BenefitRecords> {
  if (kit !== "benefit") throw new Error(`Unknown demo kit ${kit}`);
  return ensureBenefitRecords();
}

/** Call outcome keys that are the portal's own plumbing, not results. */
const PLUMBING = new Set(["portal", "scenario", "script", "operatingFor", "summaryLanguage", "maxSeconds", "keyterms", "brief", "fit", "noiseGate"]);

export function resultOutcome(outcome: unknown): Record<string, unknown> {
  const o = (outcome ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(o).filter(([k]) => !PLUMBING.has(k)));
}

const callSelect = {
  id: true,
  ref: true,
  status: true,
  agentProfile: true,
  language: true,
  startedAt: true,
  answeredAt: true,
  endedAt: true,
  durationSec: true,
  summary: true,
  transferredTo: true,
  outcome: true,
} satisfies Prisma.CallSelect;

type CallRow = Prisma.CallGetPayload<{ select: typeof callSelect }>;

function listItem(c: CallRow) {
  const o = (c.outcome ?? {}) as Record<string, unknown>;
  return {
    ref: c.ref,
    scenario: typeof o.scenario === "string" ? o.scenario : null,
    script: typeof o.script === "string" ? o.script : null,
    agent: getAgent(c.agentProfile)?.label ?? c.agentProfile,
    status: c.status,
    language: c.language,
    startedAt: c.startedAt.toISOString(),
    durationSec: c.durationSec,
    hasSummary: Boolean(c.summary),
  };
}

export async function portalCalls(portal: DemoPortal) {
  const calls = await prisma.call.findMany({
    where: { placedBy: PORTAL_PLACED_BY(portal.id) },
    orderBy: { startedAt: "desc" },
    take: 50,
    select: callSelect,
  });
  return calls.map(listItem);
}

/** One session of this portal, in full; null when the ref isn't one of its sessions. */
export async function portalCall(portal: DemoPortal, ref: string) {
  const call = await prisma.call.findFirst({
    where: { ref, placedBy: PORTAL_PLACED_BY(portal.id) },
    select: {
      ...callSelect,
      conversation: { select: { messages: true } },
      case: {
        select: {
          id: true,
          ref: true,
          title: true,
          status: true,
          priority: true,
          location: true,
          patient: { select: { firstName: true, lastName: true, policyNumber: true } },
          events: { orderBy: { createdAt: "desc" }, take: 8, select: { type: true, title: true, body: true, actor: true, createdAt: true } },
        },
      },
    },
  });
  if (!call) return null;
  const messages = ((call.conversation?.messages ?? []) as unknown as ChatMessage[]).filter((m) => m && typeof m.text === "string");
  const outcome = resultOutcome(call.outcome);
  const ended = call.endedAt != null;
  return {
    ...listItem(call),
    ended,
    summary: call.summary,
    transferredTo: call.transferredTo,
    transcript: messages.map((m) => ({ role: m.role, text: m.text, at: m.at })),
    outcome,
    case: call.case
      ? {
          ref: call.case.ref,
          title: call.case.title,
          status: call.case.status,
          priority: call.case.priority,
          location: call.case.location,
          patient: `${call.case.patient.firstName} ${call.case.patient.lastName}`,
          policy: call.case.patient.policyNumber,
          events: call.case.events.map((e) => ({ type: e.type, title: e.title, body: e.body, actor: e.actor, at: e.createdAt.toISOString() })),
        }
      : null,
    // What the client's systems receive when the call ends (the call.completed webhook), without the portal's own fields.
    crm: ended
      ? {
          event: "call.completed",
          data: {
            ref: call.ref,
            agent: call.agentProfile,
            channel: "BROWSER",
            status: call.status,
            durationSec: call.durationSec,
            summary: call.summary,
            case: call.case ? { ref: call.case.ref, priority: call.case.priority, status: call.case.status } : null,
            outcome,
          },
        }
      : null,
  };
}

/** The guarantee scenario's latest run on the kit's case: the e-mail, what was read, the decision, the letter. */
export async function guaranteeRun(records: BenefitRecords) {
  const letter = await prisma.guaranteeLetter.findFirst({
    where: { caseId: records.petra.caseId, estimateDocumentId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (!letter?.estimateDocumentId) return null;
  const estimate = await prisma.document.findUnique({
    where: { id: letter.estimateDocumentId },
    include: { extraction: true, inboundMessage: true },
  });
  if (!estimate) return null;
  const review = await prisma.billReview.findUnique({ where: { documentId: estimate.id } });
  const ex = estimate.extraction;
  const msg = estimate.inboundMessage;
  return {
    receivedAt: (msg?.receivedAt ?? estimate.createdAt).toISOString(),
    email: msg ? { ref: msg.ref, from: msg.fromAddress, subject: msg.subject, body: msg.bodyText } : null,
    estimate: {
      documentId: estimate.id,
      filename: estimate.filename,
      read: ex
        ? {
            patientName: ex.patientName,
            dateOfBirth: ex.dateOfBirth,
            policyReference: ex.policyReference,
            hospital: ex.hospital,
            doctor: ex.doctor,
            diagnosis: ex.diagnosis,
            procedures: ex.procedures,
            admissionDate: ex.admissionDate,
            amount: ex.invoiceAmount == null ? null : Number(ex.invoiceAmount),
            currency: ex.currency,
            confidence: ex.confidence == null ? null : Number(ex.confidence),
          }
        : null,
    },
    matchedCase: records.petra.caseRef,
    review: review ? { billed: Number(review.billed), recommended: Number(review.recommended), result: review.result } : null,
    letter: {
      ref: letter.ref,
      status: letter.status,
      hospital: letter.hospitalName,
      estimated: Number(letter.estimatedAmount),
      guaranteed: Number(letter.guaranteedAmount),
      excess: Number(letter.excess),
      currency: letter.currency,
      conditions: letter.conditions,
      flags: letter.flags,
      validUntil: letter.validUntil.toISOString(),
      approvedBy: letter.approvedBy,
      sentAt: letter.sentAt?.toISOString() ?? null,
      trace: letter.decisionTrace,
      pdfDocumentId: letter.pdfDocumentId,
    },
  };
}

const PLAN_OF = { murat: BENEFIT_MEMBERS.murat.plan, petra: BENEFIT_MEMBERS.petra.plan };

/** The knowledge the agents work from, for "How it learns your process". */
export function knowledge() {
  return {
    plans: Object.entries(BENEFIT_PLANS).map(([name, p]) => ({
      name,
      medicalLimit: p.medicalLimit,
      currency: "EUR",
      benefits: p.benefits.map((b) => ({ code: b.code, label: b.label, covered: b.covered, limit: b.limit, excess: b.excess, waitingHours: b.waitingHours ?? null })),
      holders: Object.entries(PLAN_OF).filter(([, plan]) => plan === name).map(([who]) => (who === "murat" ? "Murat Aydın" : "Petra Hoffmann")),
    })),
    network: BENEFIT_PROVIDERS.map((p) => ({
      ref: p.ref,
      facility: p.facility,
      district: p.district,
      city: p.city,
      specialty: p.specialty,
      doctor: p.name,
      languages: p.languages,
      kind: p.kind,
    })),
  };
}
