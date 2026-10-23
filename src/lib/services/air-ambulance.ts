import { createHash } from "node:crypto";
import type { Prisma, Provider, TransportPlan } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import type { OriginHub, TransportAssessment } from "./transport";

// ---------------------------------------------------------------------------
// Air ambulance, after the rules have said one is needed: quote requests to
// the network's operators, their quotes compared on more than price
// (accreditation, the crew the doctor asked for, bed-to-bed or airport to
// airport, how soon wheels are up), one booked, and the mission followed step
// by step onto the case timeline. EURAMI and CAMTS accreditation is required
// for a quote to be recommended; a cheaper unaccredited one is shown, flagged.
// ---------------------------------------------------------------------------

/** Where the network's operators fly from, by planning hub. */
const HUB_BASES: Record<OriginHub, string[]> = {
  IST: ["Istanbul", "Dubai"],
  SIN: ["Singapore"],
  MIA: ["Fort Lauderdale"],
};

const ACCREDITED = /EURAMI|CAMTS/i;

export async function airOperators(hub: OriginHub): Promise<Provider[]> {
  return prisma.provider.findMany({
    where: { kind: "AIR_AMBULANCE", mergedIntoId: null, city: { in: HUB_BASES[hub] } },
    orderBy: { ref: "asc" },
  });
}

export interface AirQuote {
  id: string;
  operator: string;
  providerRef: string;
  accreditations: string[];
  aircraft: string;
  crew: string;
  /** The crew includes a doctor (when the treating doctor asked for one). */
  doctorOnBoard: boolean;
  price: number;
  currency: string;
  /** Hours from booking to wheels up. */
  wheelsUpHours: number;
  /** Ground ambulances at both ends included. */
  bedToBed: boolean;
  validUntil: string;
  receivedAt: string;
  /** Why it isn't recommended, if it isn't. */
  concerns: string[];
}

export interface MissionStep {
  code: string;
  label: string;
  at: string | null;
}

export interface Mission {
  quoteId: string;
  operator: string;
  price: number;
  currency: string;
  steps: MissionStep[];
}

const MISSION_STEPS: [code: string, label: string][] = [
  ["BOOKED", "Operator booked, quote accepted"],
  ["CREW", "Crew and aircraft confirmed, flight plan filed"],
  ["BEDSIDE", "Medical crew at the bedside: handover from the treating doctor"],
  ["WHEELS_UP", "Wheels up"],
  ["LANDED", "Landed at destination"],
  ["HANDOVER", "Patient handed over at the receiving hospital"],
];

/** Each operator's profile: what it flies, who it sends and how it prices against the indicative range. */
function profileOf(p: Provider) {
  const accredited = p.accreditations.some((a) => ACCREDITED.test(a));
  if (!accredited) {
    return { aircraft: "King Air 350, unpressurised above 25,000 ft", crew: "Paramedic", doctor: false, factor: 0.78, wheelsUp: 10, bedToBed: false };
  }
  const known: Record<string, { aircraft: string; factor: number; wheelsUp: number }> = {
    "PRV-2039": { aircraft: "Learjet 45, ICU-equipped", factor: 1.0, wheelsUp: 6 },
    "PRV-2040": { aircraft: "Challenger 604, ICU-equipped", factor: 0.93, wheelsUp: 5 },
    "PRV-2041": { aircraft: "Learjet 35A, ICU-equipped", factor: 0.96, wheelsUp: 4 },
    "PRV-2042": { aircraft: "Learjet 60, ICU-equipped", factor: 1.0, wheelsUp: 6 },
  };
  const k = known[p.ref] ?? { aircraft: "Light jet, ICU-equipped", factor: 1.0, wheelsUp: 6 };
  return { ...k, crew: "Flight doctor and ICU nurse", doctor: true, bedToBed: true };
}

const planOf = (plan: TransportPlan) => ({
  assessment: plan.assessment as unknown as TransportAssessment,
  origin: ((plan.options as { origin?: OriginHub } | null)?.origin ?? "IST") as OriginHub,
});

/**
 * Operators' replies to the quote request. In a pilot they arrive by e-mail
 * or the operator's API; the demo builds them from each operator's profile so
 * the comparison can be shown, the same figures every time.
 */
export async function receiveQuotes(planId: string): Promise<TransportPlan> {
  const plan = await prisma.transportPlan.findUnique({ where: { id: planId } });
  if (!plan) throw notFound("Transport plan");
  if (plan.mode !== "AIR_AMBULANCE") throw badRequest("Quotes are compared for air ambulance plans.");
  if (plan.status === "BOOKED") throw conflict(`${plan.ref} is already booked.`);
  const { assessment, origin } = planOf(plan);
  const operators = await airOperators(origin);
  const mid = (Number(plan.estimateLow) + Number(plan.estimateHigh)) / 2;
  const now = Date.now();
  const quotes: AirQuote[] = operators.map((p, i) => {
    const prof = profileOf(p);
    // A small, fixed spread per plan and operator, so quotes differ but never drift between runs.
    const jitter = (parseInt(createHash("sha256").update(`${plan.ref}|${p.ref}`).digest("hex").slice(0, 4), 16) % 7) / 100 - 0.03;
    const price = Math.round((mid * (prof.factor + jitter)) / 100) * 100;
    const concerns: string[] = [];
    if (!p.accreditations.some((a) => ACCREDITED.test(a))) concerns.push("Not accredited by EURAMI or CAMTS");
    if (assessment.escort === "DOCTOR" && !prof.doctor) concerns.push("No doctor on board; the treating doctor asked for one");
    if ((assessment.intensiveCare || assessment.monitoring === "CONTINUOUS") && !prof.doctor) concerns.push("Crew can't run intensive care in flight");
    if (!prof.bedToBed) concerns.push("Airport to airport: ground ambulances at both ends extra");
    return {
      id: `${plan.ref}-Q${i + 1}`,
      operator: p.facility,
      providerRef: p.ref,
      accreditations: p.accreditations,
      aircraft: prof.aircraft,
      crew: prof.crew,
      doctorOnBoard: prof.doctor,
      price,
      currency: plan.currency,
      wheelsUpHours: prof.wheelsUp,
      bedToBed: prof.bedToBed,
      validUntil: new Date(now + 24 * 3_600_000).toISOString(),
      receivedAt: new Date(now - (operators.length - i) * 9 * 60_000).toISOString(),
      concerns,
    };
  });
  const updated = await prisma.transportPlan.update({ where: { id: planId }, data: { quotes: quotes as unknown as Prisma.InputJsonValue } });
  const best = recommendedQuote(quotes);
  await prisma.caseEvent.create({
    data: {
      caseId: plan.caseId,
      type: "TRANSPORT",
      title: `${quotes.length} air ambulance quotes for ${plan.ref}${best ? `: best value ${best.operator}, ${best.price.toLocaleString("en-GB")} ${best.currency}` : ""}`,
      body: quotes.map((q) => `${q.operator}: ${q.price.toLocaleString("en-GB")} ${q.currency}${q.concerns.length ? ` (${q.concerns.join("; ")})` : ""}`).join(" · "),
      actor: "agent:transport",
    },
  });
  return updated;
}

/** The cheapest quote with no concerns: accredited, the crew asked for, bed to bed. */
export function recommendedQuote(quotes: AirQuote[]): AirQuote | null {
  return [...quotes].filter((q) => q.concerns.length === 0).sort((a, b) => a.price - b.price || a.wheelsUpHours - b.wheelsUpHours)[0] ?? null;
}

const actorOf = (by: string) => (by.startsWith("system") || by.startsWith("agent:") ? by : `operator:${by}`);

/** Books one operator's quote; the mission starts. A quote with concerns needs a reason. */
export async function bookQuote(planId: string, quoteId: string, by: string, reason?: string | null) {
  const plan = await prisma.transportPlan.findUnique({ where: { id: planId } });
  if (!plan) throw notFound("Transport plan");
  if (plan.status === "BOOKED") throw conflict(`${plan.ref} is already booked.`);
  const quotes = (plan.quotes as unknown as AirQuote[] | null) ?? [];
  const quote = quotes.find((q) => q.id === quoteId);
  if (!quote) throw notFound("Quote");
  if (quote.concerns.length && !reason?.trim()) throw badRequest(`Give a reason to book a quote with concerns (${quote.concerns.join("; ")}).`);
  const now = new Date().toISOString();
  const mission: Mission = {
    quoteId,
    operator: quote.operator,
    price: quote.price,
    currency: quote.currency,
    steps: MISSION_STEPS.map(([code, label], i) => ({ code, label, at: i === 0 ? now : null })),
  };
  const updated = await prisma.transportPlan.update({ where: { id: planId }, data: { status: "BOOKED", mission: mission as unknown as Prisma.InputJsonValue } });
  await prisma.caseEvent.create({
    data: {
      caseId: plan.caseId,
      type: "TRANSPORT",
      title: `${plan.ref}: ${quote.operator} booked, ${quote.price.toLocaleString("en-GB")} ${quote.currency}`,
      body: [`${quote.aircraft}; ${quote.crew}; wheels up within ${quote.wheelsUpHours} hours${quote.bedToBed ? "; bed to bed" : ""}.`, reason?.trim() ? `Booked despite: ${quote.concerns.join("; ")}. Reason: ${reason.trim()}` : null]
        .filter(Boolean)
        .join(" "),
      actor: actorOf(by),
    },
  });
  return updated;
}

/** Marks the mission's next step done (the operator's ops desk reports it), onto the case timeline. */
export async function advanceMission(planId: string, by: string) {
  const plan = await prisma.transportPlan.findUnique({ where: { id: planId } });
  if (!plan) throw notFound("Transport plan");
  const mission = plan.mission as unknown as Mission | null;
  if (!mission) throw conflict("Book an operator first.");
  const next = mission.steps.find((s) => !s.at);
  if (!next) throw conflict("The mission is complete.");
  next.at = new Date().toISOString();
  const updated = await prisma.transportPlan.update({ where: { id: planId }, data: { mission: mission as unknown as Prisma.InputJsonValue } });
  await prisma.caseEvent.create({
    data: { caseId: plan.caseId, type: "TRANSPORT", title: `${plan.ref} · ${mission.operator}: ${next.label.toLowerCase()}`, body: null, actor: actorOf(by) },
  });
  if (next.code === "HANDOVER") {
    await prisma.case.update({ where: { id: plan.caseId }, data: { status: "RESOLVED" } });
  }
  return updated;
}
