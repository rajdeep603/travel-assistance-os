import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reviewToNegotiate } from "@/lib/services/bill-negotiation";
import { getAgent } from "./agents/registry";

// ---------------------------------------------------------------------------
// The voice agents as a presenter starts them in the browser: who the agent
// is, who the presenter plays, a line to open with, and a ready demo case
// for agents that call about one. Outbound agents run in the browser too:
// the presenter answers as the hospital or traveller being called.
// ---------------------------------------------------------------------------

export type ScenarioGroup = "travellers-call" | "providers-call" | "we-call-providers" | "we-call-travellers";

export const SCENARIO_GROUPS: Record<ScenarioGroup, string> = {
  "travellers-call": "Travellers call us",
  "providers-call": "Hospitals call us",
  "we-call-providers": "We call hospitals",
  "we-call-travellers": "We call travellers",
};

interface ScenarioDef {
  agentId: string;
  group: ScenarioGroup;
  youPlay: string;
  tryLine: string;
  /** Finds a demo case this agent can call about (outbound agents). */
  findCase?: () => Promise<{ id: string; ref: string } | null>;
  /** Something to do first, when the case isn't ready for this agent yet. */
  prerequisite?: (caseId: string) => Promise<ScenarioNeed | null>;
}

export interface ScenarioNeed {
  label: string;
  /** A bundled sample to receive in the Inbox (src/lib/intake/samples.ts). */
  emailSample?: string;
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
  case: { id: string; ref: string } | null;
  needs: ScenarioNeed | null;
}

const OPEN_CASE: Prisma.CaseWhereInput = { status: { notIn: ["RESOLVED", "CLOSED"] } };

async function byRef(ref: string) {
  return prisma.case.findUnique({ where: { ref }, select: { id: true, ref: true } });
}

const DEFS: ScenarioDef[] = [
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
    findCase: () => byRef("CASE-1022"),
    prerequisite: async (caseId) =>
      (await reviewToNegotiate(caseId))
        ? null
        : { label: "Receive the hospital's overbilled final invoice first, so there is a reviewed bill to negotiate.", emailSample: "hospital-final-invoice" },
  },
  {
    agentId: "outbound-medical-transport",
    group: "we-call-providers",
    youPlay: "The treating doctor",
    tryLine: "Answer as the cardiologist: stable after a stent, fit to fly from Monday, wheelchair, 2 L/min oxygen, nurse escort.",
    findCase: async () =>
      (await byRef("CASE-1022")) ??
      (await prisma.case.findFirst({ where: { ...OPEN_CASE, assistanceType: "HOSPITALIZATION" }, orderBy: { updatedAt: "desc" }, select: { id: true, ref: true } })),
  },
  {
    agentId: "outbound-hospital-coordination",
    group: "we-call-providers",
    youPlay: "The hospital's admissions desk",
    tryLine: "Answer: “Admissions.” Then give the ward, the doctor and a cost estimate.",
    findCase: async () => (await byRef("CASE-1024")) ?? (await prisma.case.findFirst({ where: { ...OPEN_CASE, appointments: { some: {} } }, select: { id: true, ref: true } })),
  },
  {
    agentId: "outbound-log-confirmation",
    group: "we-call-providers",
    youPlay: "The hospital's billing office",
    tryLine: "Answer: “Billing.” Then say whether the guarantee letter arrived.",
    findCase: async () =>
      (await prisma.guaranteeLetter.findFirst({ where: { status: "SENT" }, orderBy: { createdAt: "desc" }, select: { case: { select: { id: true, ref: true } } } }))?.case ?? null,
  },
  {
    agentId: "outbound-claim-missing-info",
    group: "we-call-travellers",
    youPlay: "The claimant",
    tryLine: "Answer the phone, then ask what's missing from your claim.",
    findCase: async () =>
      (await prisma.claim.findFirst({
        where: { status: { in: ["INFO_REQUESTED", "NEEDS_REVIEW"] }, caseId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { case: { select: { id: true, ref: true } } },
      }))?.case ?? null,
  },
  {
    agentId: "outbound-appointment-reminder",
    group: "we-call-travellers",
    youPlay: "The traveller with tomorrow's appointment",
    tryLine: "Answer, then confirm, or ask to move the appointment.",
    findCase: async () =>
      (await prisma.appointment.findFirst({
        where: { status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { gte: new Date() }, caseId: { not: null } },
        orderBy: { scheduledAt: "asc" },
        select: { case: { select: { id: true, ref: true } } },
      }))?.case ?? null,
  },
  {
    agentId: "outbound-wellbeing-followup",
    group: "we-call-travellers",
    youPlay: "The traveller after their visit",
    tryLine: "Answer, then say how you feel since the visit.",
    findCase: async () =>
      (await prisma.appointment.findFirst({
        where: { status: "COMPLETED", caseId: { not: null } },
        orderBy: { scheduledAt: "desc" },
        select: { case: { select: { id: true, ref: true } } },
      }))?.case ?? null,
  },
];

export async function voiceScenarios(): Promise<VoiceScenario[]> {
  const out: VoiceScenario[] = [];
  for (const def of DEFS) {
    const profile = getAgent(def.agentId);
    if (!profile) continue;
    const kase = def.findCase ? await def.findCase().catch(() => null) : null;
    out.push({
      agentId: profile.id,
      label: profile.label,
      description: profile.description,
      group: def.group,
      direction: profile.direction,
      youPlay: def.youPlay,
      tryLine: def.tryLine,
      defaultLanguage: profile.languageHint === "tr" ? "Turkish" : "the caller's",
      case: kase,
      needs: kase && def.prerequisite ? await def.prerequisite(kase.id).catch(() => null) : !kase && profile.requiresCase ? { label: "No demo case is ready for this agent." } : null,
    });
  }
  return out;
}
