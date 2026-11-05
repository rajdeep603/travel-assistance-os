import { Prisma, type AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { receiveSample } from "@/lib/intake/simulate";
import { isUniqueViolation } from "@/lib/refs";
import { reviewToNegotiate } from "@/lib/services/bill-negotiation";
import { deleteDocument } from "@/lib/services/erase";
import { zonedToUtc, zonedToday } from "@/lib/time";
import { BASE_NEVER } from "./agents/prompt";
import { getAgent } from "./agents/registry";
import type { AgentFit, AgentProfile } from "./agents/types";
import { toolAbilityLabel } from "./tool-labels";

// ---------------------------------------------------------------------------
// The voice agents as a presenter starts them in the browser: who the agent
// is, who the presenter plays, a line to open with, and a ready demo case
// for agents that call about one. Each case-calling agent is pinned to one
// seeded case whose records fit it, the agent's own `fit` check says whether
// they still do (a rehearsal consumes them: a letter gets acknowledged, an
// appointment cancelled, a bill agreed; dates drift), and `prepare` puts the
// pinned case back the way the agent needs it.
// ---------------------------------------------------------------------------

export type ScenarioGroup = "travellers-call" | "providers-call" | "we-call-providers" | "we-call-payers" | "we-call-travellers" | "hospital-calls-payers";

export const SCENARIO_GROUPS: Record<ScenarioGroup, string> = {
  "travellers-call": "Travellers call us",
  "providers-call": "Hospitals call us",
  "we-call-providers": "We call hospitals",
  "we-call-payers": "We call insurers",
  "we-call-travellers": "We call travellers",
  "hospital-calls-payers": "For hospitals: we call payers",
};

export interface DemoCase {
  id: string;
  ref: string;
}

export interface DemoRecord {
  ref: string;
  label: string;
}

interface ScenarioDef {
  agentId: string;
  group: ScenarioGroup;
  youPlay: string;
  tryLine: string;
  /** The seeded case this agent is rehearsed on. */
  pinnedRef?: string;
  /** Another case that fits, when the pinned one isn't in the database. */
  findCase?: () => Promise<DemoCase | null>;
  /** The record (not a case) it calls about: an invoice for the payment follow-up. */
  pinnedRecord?: string;
  findRecord?: () => Promise<DemoRecord | null>;
  /** Puts the pinned case or record back into the state the agent needs. */
  prepare?: (kase: DemoCase | null) => Promise<void>;
}

export interface VoiceScenario {
  agentId: string;
  label: string;
  description: string;
  group: ScenarioGroup;
  direction: "inbound" | "outbound";
  youPlay: string;
  tryLine: string;
  defaultLanguage: string;
  /** Calls about a case: needs one, and is only started when it fits. */
  requiresCase: boolean;
  /** The case the session would use: the one the page was opened for, else the demo case. */
  case: DemoCase | null;
  /** The record it calls about, for agents that don't call about a case. */
  record: DemoRecord | null;
  /** Whether `case` (or `record`) gives the agent something to call about; null for agents that need neither. */
  fit: AgentFit | null;
  /** The pinned demo case, with its own readiness: offered when the chosen case doesn't fit. */
  suggested: (DemoCase & { fit: AgentFit }) | null;
  /** "Make it ready" can repair this agent's demo case or record. */
  canPrepare: boolean;
  howItWorks: HowItWorks;
}

/** An agent's abilities and limits in plain words, for people judging it. */
export interface HowItWorks {
  can: string[];
  never: string[];
  handsOver: string[];
  maxMinutes: number;
}

/** Tools every agent has that say nothing about what it's for. */
const PLUMBING_TOOLS = new Set(["end_call", "transfer_to_human"]);

export function howItWorks(profile: AgentProfile): HowItWorks {
  return {
    can: [...new Set(profile.tools.filter((t) => !PLUMBING_TOOLS.has(t)).map(toolAbilityLabel))],
    never: [...BASE_NEVER, ...(profile.guardrails?.never ?? [])],
    handsOver: profile.guardrails?.handsOver ?? [],
    maxMinutes: Math.round(profile.maxSeconds / 60),
  };
}

const OPEN_CASE: Prisma.CaseWhereInput = { status: { notIn: ["RESOLVED", "CLOSED"] } };

async function byRef(ref: string): Promise<DemoCase | null> {
  return prisma.case.findUnique({ where: { ref }, select: { id: true, ref: true } });
}

async function receivable(ref: string): Promise<DemoRecord | null> {
  const r = await prisma.receivable.findUnique({ where: { ref }, select: { ref: true, facility: true, payerName: true } });
  return r ? { ref: r.ref, label: `${r.ref} · ${r.facility} → ${r.payerName}` } : null;
}

// ---------------------------------------------------------------- prepare

/**
 * Moves a seeded appointment to a slot `daysFromNow` days away (creating it
 * when a database never had it), trying later times when a visitor booked
 * that slot: one pending or confirmed booking per provider slot.
 */
async function placeAppointment(
  ref: string,
  kase: DemoCase,
  people: { patientRef: string; providerRef: string },
  slot: { daysFromNow: number; times: string[]; status: AppointmentStatus; reason: string }
): Promise<void> {
  const [patient, provider] = await Promise.all([
    prisma.patient.findUnique({ where: { ref: people.patientRef }, select: { id: true } }),
    prisma.provider.findUnique({ where: { ref: people.providerRef }, select: { id: true } }),
  ]);
  if (!patient || !provider) throw conflict(`${ref} needs ${people.patientRef} and ${people.providerRef}, which this database doesn't have.`);
  for (const time of slot.times) {
    const scheduledAt = zonedToUtc(zonedToday(slot.daysFromNow), time);
    try {
      await prisma.appointment.upsert({
        where: { ref },
        create: { ref, scheduledAt, status: slot.status, reason: slot.reason, source: "WEB", patientId: patient.id, providerId: provider.id, caseId: kase.id },
        update: { scheduledAt, status: slot.status, caseId: kase.id },
      });
      return;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw conflict(`Every slot tried for ${ref} is taken by a live booking.`);
}

/** Oliver Bennett's admission (CASE-1024): the cardiology follow-up ahead, the guarantee letter sent and not yet acknowledged. */
async function prepareAdmission(kase: DemoCase | null): Promise<void> {
  if (!kase) return;
  await placeAppointment("APT-2026-1006", kase, { patientRef: "PAT-1007", providerRef: "PRV-2005" }, { daysFromNow: 5, times: ["10:30", "10:45", "11:00"], status: "CONFIRMED", reason: "Cardiology follow-up after discharge" });
  const letter = await prisma.guaranteeLetter.findUnique({ where: { ref: "LOG-0903" }, select: { id: true } });
  if (!letter) throw conflict("LOG-0903 isn't in this database (it comes with a full seed).");
  await prisma.guaranteeLetter.update({ where: { id: letter.id }, data: { status: "SENT", acknowledgedAt: null } });
}

/** Lena Koch's case (CASE-1022): a reviewed, not yet agreed final invoice, and the cardiology clearance ahead. */
async function prepareLenaKoch(kase: DemoCase | null): Promise<void> {
  if (!kase) return;
  await placeAppointment("APT-2026-1008", kase, { patientRef: "PAT-1003", providerRef: "PRV-2005" }, { daysFromNow: 2, times: ["11:30", "11:45", "12:00"], status: "CONFIRMED", reason: "Cardiology clearance" });
  const review = await reviewToNegotiate(kase.id);
  if (review) {
    // A rehearsal agreed it: forget the agreement rather than bill the case twice.
    if (review.agreement) await prisma.billReview.update({ where: { id: review.id }, data: { agreement: Prisma.DbNull, agreedAmount: null } });
    return;
  }
  await receiveSample("email", "hospital-final-invoice");
}

const DEFS: ScenarioDef[] = [
  {
    agentId: "inbound-emergency-intake",
    group: "travellers-call",
    youPlay: "A trek leader in Nepal: a client has a bad headache and is vomiting at 4,200 m",
    tryLine: "Hello, I'm leading a group near Dingboche. One of my clients has a severe headache and is vomiting. We're at about 4,200 metres.",
  },
  {
    agentId: "outbound-missed-call-return",
    group: "we-call-travellers",
    youPlay: "A traveller who rang the line about a dentist and hung up in the queue",
    tryLine: "Oh yes, I called. I need a dentist in Istanbul today, I've broken a tooth.",
  },
  {
    agentId: "outbound-benefit-verification",
    group: "we-call-payers",
    youPlay: "The insurer's provider desk",
    tryLine: "Provider services, good morning. Which patient is this about?",
    pinnedRef: "CASE-1024",
    findCase: () => prisma.case.findFirst({ where: { ...OPEN_CASE, assistanceType: "HOSPITALIZATION" }, orderBy: { updatedAt: "desc" }, select: { id: true, ref: true } }),
    // Nothing a rehearsal consumes: the check only adds to the case timeline.
    prepare: async () => {},
  },
  {
    agentId: "outbound-bed-acceptance",
    group: "we-call-providers",
    youPlay: "Bed management at the receiving hospital at home",
    tryLine: "Bed management. Who is the patient and what do they need?",
    pinnedRef: "CASE-1022",
    findCase: () => prisma.case.findFirst({ where: { ...OPEN_CASE, assistanceType: { in: ["HOSPITALIZATION", "REPATRIATION", "EVACUATION"] } }, orderBy: { updatedAt: "desc" }, select: { id: true, ref: true } }),
    // Nothing a rehearsal consumes: the answer only adds to the case timeline.
    prepare: async () => {},
  },
  {
    agentId: "inbound-hotline",
    group: "travellers-call",
    youPlay: "A traveller calling the 24/7 line",
    tryLine: "“Where is my case? I'm James Carter, born 2 November 1979.” or “My flight was delayed eight hours: is that covered?”",
  },
  {
    agentId: "appointment-booking",
    group: "travellers-call",
    youPlay: "A traveller who needs a doctor",
    tryLine: "“I'm in Taksim and I need to see a doctor tomorrow afternoon.”",
  },
  {
    agentId: "inbound-provider-line",
    group: "providers-call",
    youPlay: "A hospital's international patient desk",
    tryLine: "“Marmara Heart Center here. Has the guarantee for Lena Koch, born 29 July 1964, been issued?”",
  },
  {
    agentId: "outbound-bill-negotiation",
    group: "we-call-providers",
    youPlay: "The hospital's billing office (push back on the reduction)",
    tryLine: "Answer: “Billing department.” Then object to the reduction and make a counter-offer.",
    // Lena Koch's case: the overbilled final invoice in the Inbox samples bills it.
    pinnedRef: "CASE-1022",
    prepare: prepareLenaKoch,
  },
  {
    agentId: "outbound-medical-transport",
    group: "we-call-providers",
    youPlay: "The treating doctor",
    tryLine: "Answer as the cardiologist: stable after a stent, fit to fly from Monday, wheelchair, 2 L/min oxygen, nurse escort.",
    pinnedRef: "CASE-1022",
    findCase: () => prisma.case.findFirst({ where: { ...OPEN_CASE, assistanceType: "HOSPITALIZATION" }, orderBy: { updatedAt: "desc" }, select: { id: true, ref: true } }),
    prepare: prepareLenaKoch,
  },
  {
    agentId: "outbound-hospital-coordination",
    group: "we-call-providers",
    youPlay: "The hospital's admissions desk",
    tryLine: "Answer: “Admissions.” Then give the ward, the doctor and a cost estimate.",
    pinnedRef: "CASE-1024",
    findCase: () => prisma.case.findFirst({ where: { ...OPEN_CASE, appointments: { some: {} } }, select: { id: true, ref: true } }),
    prepare: prepareAdmission,
  },
  {
    agentId: "outbound-log-confirmation",
    group: "we-call-providers",
    youPlay: "The hospital's billing office",
    tryLine: "Answer: “Billing.” Then say whether the guarantee letter arrived.",
    pinnedRef: "CASE-1024",
    findCase: async () =>
      (await prisma.guaranteeLetter.findFirst({ where: { status: "SENT" }, orderBy: { createdAt: "desc" }, select: { case: { select: { id: true, ref: true } } } }))?.case ?? null,
    prepare: prepareAdmission,
  },
  {
    agentId: "outbound-claim-missing-info",
    group: "we-call-travellers",
    youPlay: "The claimant",
    tryLine: "Answer the phone, then ask what's missing from your claim.",
    // James Carter's ankle fracture: the discharge summary and the policy number are missing.
    pinnedRef: "CASE-1021",
    findCase: async () =>
      (await prisma.claim.findFirst({
        where: { status: { in: ["INFO_REQUESTED", "NEEDS_REVIEW"] }, caseId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { case: { select: { id: true, ref: true } } },
      }))?.case ?? null,
    prepare: async (kase) => {
      if (!kase) return;
      const claim = await prisma.claim.findUnique({ where: { ref: "CLM-10243" }, include: { documents: { select: { id: true, kind: true } } } });
      if (!claim) throw conflict("CLM-10243 isn't in this database (it comes with a full seed).");
      // Undo a rehearsal upload: the seed never gives this claim a discharge summary.
      for (const d of claim.documents.filter((d) => d.kind === "DISCHARGE_SUMMARY")) await deleteDocument(d.id);
      await prisma.claim.update({ where: { id: claim.id }, data: { status: "NEEDS_REVIEW", caseId: kase.id } });
    },
  },
  {
    agentId: "outbound-appointment-reminder",
    group: "we-call-travellers",
    youPlay: "The traveller with tomorrow's appointment",
    tryLine: "Answer, then confirm, or ask to move the appointment.",
    // Siobhan Murphy's eye appointment, tomorrow morning.
    pinnedRef: "CASE-1016",
    findCase: async () =>
      (await prisma.appointment.findFirst({
        where: { status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { gte: new Date() }, caseId: { not: null } },
        orderBy: { scheduledAt: "asc" },
        select: { case: { select: { id: true, ref: true } } },
      }))?.case ?? null,
    prepare: async (kase) => {
      if (!kase) return;
      await placeAppointment("APT-2026-1009", kase, { patientRef: "PAT-1010", providerRef: "PRV-2013" }, { daysFromNow: 1, times: ["10:30", "10:45", "11:00", "11:15"], status: "PENDING", reason: "Eye irritation" });
    },
  },
  {
    agentId: "outbound-wellbeing-followup",
    group: "we-call-travellers",
    youPlay: "The traveller after their visit",
    tryLine: "Answer, then say how you feel since the visit.",
    // Carlos Garcia, seen for his knee yesterday afternoon.
    pinnedRef: "CASE-1015",
    findCase: async () =>
      (await prisma.appointment.findFirst({
        where: { status: "COMPLETED", caseId: { not: null } },
        orderBy: { scheduledAt: "desc" },
        select: { case: { select: { id: true, ref: true } } },
      }))?.case ?? null,
    prepare: async (kase) => {
      if (!kase) return;
      await placeAppointment("APT-2026-1005", kase, { patientRef: "PAT-1009", providerRef: "PRV-2017" }, { daysFromNow: -1, times: ["15:00"], status: "COMPLETED", reason: "Knee injury assessment" });
    },
  },
  {
    agentId: "outbound-payment-followup",
    group: "hospital-calls-payers",
    youPlay: "The payer's accounts desk (an assistance company abroad)",
    tryLine: "Answer as accounts payable: say it's in review and will be paid next week, or that the medical report is missing.",
    // Saranda Demo Polyclinic's invoice to a Nordic payer, 72 days unpaid.
    pinnedRecord: "RCV-0905",
    findRecord: async () => {
      const { receivableToChase } = await import("@/lib/services/receivables");
      const r = await receivableToChase();
      return r ? { ref: r.ref, label: `${r.ref} · ${r.facility} → ${r.payerName}` } : null;
    },
    prepare: async () => {
      const r = await prisma.receivable.findUnique({ where: { ref: "RCV-0905" }, select: { id: true } });
      if (!r) throw conflict("RCV-0905 isn't in this database.");
      await prisma.receivable.update({ where: { id: r.id }, data: { status: "SUBMITTED", payerAnswer: Prisma.DbNull } });
    },
  },
];

const NO_CASE: AgentFit = { ready: false, why: "No demo case is ready for this agent.", record: null };

async function demoCase(def: ScenarioDef): Promise<DemoCase | null> {
  return (def.pinnedRef ? await byRef(def.pinnedRef) : null) ?? (def.findCase ? await def.findCase().catch(() => null) : null);
}

async function demoRecord(def: ScenarioDef): Promise<DemoRecord | null> {
  return (def.pinnedRecord ? await receivable(def.pinnedRecord) : null) ?? (def.findRecord ? await def.findRecord().catch(() => null) : null);
}

/**
 * The catalogue the Voice Agents page shows. Opened from a case (`caseId`),
 * every agent is judged on that case; otherwise each agent comes with its
 * demo case, judged the same way.
 */
export async function voiceScenarios(opts: { caseId?: string | null } = {}): Promise<VoiceScenario[]> {
  const override = opts.caseId ? await prisma.case.findUnique({ where: { id: opts.caseId }, select: { id: true, ref: true } }) : null;
  if (opts.caseId && !override) throw notFound("Case");
  const out: VoiceScenario[] = [];
  for (const def of DEFS) {
    const profile = getAgent(def.agentId);
    if (!profile) continue;
    const requiresCase = Boolean(profile.requiresCase);
    const demo = requiresCase ? await demoCase(def) : null;
    const record = !requiresCase ? await demoRecord(def) : null;
    // Inbound agents work on the case the page was opened for; record agents (an invoice) on no case.
    const kase = requiresCase ? (override ?? demo) : profile.direction === "inbound" ? override : null;
    let fit: AgentFit | null = null;
    let suggested: VoiceScenario["suggested"] = null;
    if (requiresCase) {
      fit = kase && profile.fit ? await profile.fit(kase.id) : kase ? null : NO_CASE;
      if (demo) suggested = { ...demo, fit: demo.id === kase?.id && fit ? fit : profile.fit ? await profile.fit(demo.id) : { ready: true, why: "" } };
    } else if (profile.fitRecord) {
      fit = await profile.fitRecord(record?.ref ?? null);
    }
    out.push({
      agentId: profile.id,
      label: profile.label,
      description: profile.description,
      group: def.group,
      direction: profile.direction,
      youPlay: def.youPlay,
      tryLine: def.tryLine,
      defaultLanguage: profile.languageHint === "tr" ? "Turkish" : "the caller's",
      requiresCase,
      case: kase,
      record,
      fit,
      suggested,
      canPrepare: Boolean(def.prepare),
      howItWorks: howItWorks(profile),
    });
  }
  return out;
}

export interface PreparedScenario {
  agentId: string;
  label: string;
  case: DemoCase | null;
  record: DemoRecord | null;
  fit: AgentFit;
}

/**
 * Puts an agent's pinned demo case (or record) back into the state the agent
 * needs, and says whether it is ready now. Only the pinned demo records are
 * touched, and the reset is written on the case's timeline.
 */
export async function prepareScenario(agentId: string, operator: string | null): Promise<PreparedScenario> {
  const def = DEFS.find((d) => d.agentId === agentId);
  const profile = def ? getAgent(def.agentId) : null;
  if (!def || !profile) throw notFound("Voice agent");
  if (!def.prepare) throw conflict(`${profile.label} has no demo case to prepare: it works on whatever the caller brings.`);
  const kase = profile.requiresCase ? await demoCase(def) : null;
  if (profile.requiresCase && !kase) throw conflict(`${def.pinnedRef ?? "Its demo case"} isn't in this database, so nothing can be prepared.`);
  await def.prepare(kase);
  const record = profile.requiresCase ? null : await demoRecord(def);
  const fit: AgentFit =
    kase && profile.fit ? await profile.fit(kase.id) : profile.fitRecord ? await profile.fitRecord(record?.ref ?? null) : { ready: true, why: "" };
  if (kase) {
    await prisma.caseEvent.create({
      data: {
        caseId: kase.id,
        type: "NOTE",
        title: `Demo case reset for ${profile.label}`,
        body: fit.ready ? `Ready: ${fit.record ?? "the records the agent calls about"}.` : `Still not ready: ${fit.why}`,
        actor: operator ? `operator:${operator}` : "system",
      },
    });
  }
  return { agentId: profile.id, label: profile.label, case: kase, record, fit };
}

/** Prepares several agents' demo cases, in order (two agents may share a case). */
export async function prepareScenarios(agentIds: string[], operator: string | null): Promise<PreparedScenario[]> {
  const out: PreparedScenario[] = [];
  for (const id of [...new Set(agentIds)]) out.push(await prepareScenario(id, operator));
  return out;
}

/** The agents whose demo case can be prepared. */
export const PREPARABLE_AGENTS = DEFS.filter((d) => d.prepare).map((d) => d.agentId);
