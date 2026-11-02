import type { PriceItem, Provider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isPastSlot, utcToZoned, zonedDayRange, zonedToday } from "@/lib/time";
import { distanceKm } from "./nlu";
import { rateCardOf } from "./provider-network";
import { slotsForDate } from "./provider-search";
import { CARE_NEEDS, type CareNeed, REFERENCE_PRICES_EUR, needById, providerMeetsNeed } from "./provider-needs";
import { type OpenState, openState } from "./provider-hours";
import { type LatLng, type Travel, drivingMinutes } from "./provider-travel";

// ---------------------------------------------------------------------------
// Finding care near a patient, the way a case manager needs it at 3 am:
// everyone who answers the need within 2 km, widening to 5, 10 and 25 km
// until there is a choice; open now if asked, in the patient's language,
// direct billing if asked; closed practices left out and every exclusion
// explained; ranked by distance, rating, verification, accreditation and
// price, with driving minutes, free slots and an estimate for the need.
// ---------------------------------------------------------------------------

export const RADII_KM = [2, 5, 10, 25];
const ENOUGH = 3;

export interface FindCareInput {
  at: LatLng;
  label: string;
  need: string;
  openNow?: boolean;
  directBilling?: boolean;
  language?: string | null;
  /** The day to offer slots for (YYYY-MM-DD, Istanbul); tomorrow by default. */
  date?: string;
  timeOfDay?: string;
  limit?: number;
  now?: Date;
}

export interface Estimate {
  item: PriceItem;
  amount: number;
  currency: string;
  basis: "quoted" | "network";
}

export interface CareResult {
  provider: Provider;
  distanceKm: number | null;
  travel: Travel | null;
  open: OpenState;
  estimate: Estimate | null;
  slots: { date: string; time: string }[];
  duplicatesMerged: number;
  score: number;
  reasons: string[];
}

export interface Excluded {
  id: string;
  ref: string;
  name: string;
  facility: string;
  distanceKm: number;
  reason: string;
}

export interface CareSearch {
  at: LatLng & { label: string };
  need: { id: string; label: string; item: PriceItem | null };
  date: string;
  steps: { radiusKm: number; found: number }[];
  radiusKm: number;
  results: CareResult[];
  excluded: Excluded[];
}

type Row = Provider & { prices: { item: PriceItem; amount: unknown; currency: string }[]; _count: { mergedFrom: number } };

function inTimeOfDay(time: string, timeOfDay?: string): boolean {
  if (!timeOfDay) return true;
  const hour = Number(time.split(":")[0]);
  if (timeOfDay === "morning") return hour >= 8 && hour < 12;
  if (timeOfDay === "afternoon") return hour >= 12 && hour < 17;
  if (timeOfDay === "evening") return hour >= 17 && hour <= 21;
  return true;
}

/** Direct billing: stated by the practice, or implied by negotiated network rates. */
export const billsDirectly = (p: Pick<Provider, "acceptsDirectBilling" | "rateCard">): boolean | null =>
  p.acceptsDirectBilling != null ? p.acceptsDirectBilling : rateCardOf(p) ? true : null;

function estimateFor(p: Row, need: CareNeed): Estimate | null {
  if (!need.item) return null;
  const quoted = p.prices.find((q) => q.item === need.item);
  if (quoted) return { item: need.item, amount: Number(quoted.amount), currency: quoted.currency, basis: "quoted" };
  const card = rateCardOf(p);
  const amount = Math.round(REFERENCE_PRICES_EUR[need.item] * (card?.multiplier ?? 1));
  return { item: need.item, amount, currency: "EUR", basis: "network" };
}

export async function findCare(input: FindCareInput): Promise<CareSearch> {
  const need = needById(input.need) ?? CARE_NEEDS[0];
  const now = input.now ?? new Date();
  const date = input.date ?? zonedToday(1, now);
  const limit = input.limit ?? 8;
  const video = need.id === "video";
  const rows = (await prisma.provider.findMany({
    where: { mergedIntoId: null, kind: video ? "TELEMEDICINE" : { in: ["CLINIC", "HOSPITAL"] } },
    include: { prices: { orderBy: { collectedAt: "desc" } }, _count: { select: { mergedFrom: true } } },
  })) as Row[];

  // Slots already taken on that day are not offered again.
  const day = zonedDayRange(date);
  const booked = await prisma.appointment.findMany({
    where: { scheduledAt: { gte: day.start, lt: day.end }, status: { in: ["PENDING", "CONFIRMED"] } },
    select: { providerId: true, scheduledAt: true },
  });
  const bookedSlots = new Set(booked.map((b) => `${b.providerId}|${utcToZoned(b.scheduledAt).time}`));
  const freeSlots = (p: Provider) =>
    slotsForDate(p, date)
      .filter((t) => !bookedSlots.has(`${p.id}|${t}`) && !isPastSlot(date, t, now) && inTimeOfDay(t, input.timeOfDay))
      .map((time) => ({ date, time }));

  const excluded: Excluded[] = [];
  const withDistance = rows
    .map((p) => ({ p, d: video ? 0 : distanceKm(input.at, { lat: p.latitude, lng: p.longitude }) }))
    .sort((a, b) => a.d - b.d);
  const candidates = withDistance.filter(({ p, d }) => {
    if (!video && d > RADII_KM[RADII_KM.length - 1]) return false;
    if (!providerMeetsNeed(p, need)) return false;
    let reason: string | null = null;
    if (p.status === "CLOSED") reason = "closed";
    else if (p.status === "MOVED") reason = "has moved";
    else if (input.directBilling && billsDirectly(p) !== true) reason = billsDirectly(p) === false ? "no direct billing" : "direct billing unknown";
    else if (input.language && !p.languages.some((l) => l.toLowerCase() === input.language!.toLowerCase())) reason = `no ${input.language}`;
    else if (input.openNow) {
      const o = openState(p, now);
      if (o.open === false) reason = `closed now${o.opensAt ? `, opens ${o.opensAt}` : ""}`;
    }
    if (reason) {
      excluded.push({ id: p.id, ref: p.ref, name: p.name, facility: p.facility, distanceKm: Math.round(d * 10) / 10, reason });
      return false;
    }
    return true;
  });

  const steps: CareSearch["steps"] = [];
  let radiusKm = RADII_KM[RADII_KM.length - 1];
  let within = candidates;
  if (!video) {
    for (const r of RADII_KM) {
      radiusKm = r;
      within = candidates.filter((c) => c.d <= r);
      steps.push({ radiusKm: r, found: within.length });
      if (within.length >= ENOUGH) break;
    }
  }
  within = within.slice(0, Math.max(limit, 12));

  const travel = video ? [] : await drivingMinutes(input.at, within.map((c) => ({ lat: c.p.latitude, lng: c.p.longitude })), within.map((c) => c.d));
  const maxD = Math.max(radiusKm, 0.1);
  const results: CareResult[] = within.map(({ p, d }, idx) => {
    const reasons: string[] = [];
    let score = 0;
    if (!video) {
      score += (1 - d / maxD) * 40;
      if (d <= 2) reasons.push("close by");
    } else reasons.push("no travel: a link by e-mail and SMS");
    const open = openState(p, now);
    if (open.open === true) {
      score += 6;
      reasons.push("open now");
    } else if (open.open === false) score -= 6;
    score += (p.rating / 5) * 25;
    if (p.rating >= 4.7) reasons.push("top rated");
    if (p.internalRating != null && p.internalRating >= 4) reasons.push("team rates it well");
    if (p.status === "VERIFIED") {
      score += 15;
      reasons.push("verified by phone");
    } else if (p.status === "UNREACHABLE") {
      score -= 15;
      reasons.push("not reachable by phone");
    }
    if (p.accreditations.length) {
      score += 4;
      reasons.push(p.accreditations[0]);
    }
    if (rateCardOf(p)) {
      score += 6;
      reasons.push("network rates");
    } else if (p.acceptsDirectBilling) {
      score += 6;
      reasons.push("direct billing");
    }
    if (input.language && p.languages.some((l) => l.toLowerCase() === input.language!.toLowerCase())) reasons.push(`${input.language}-speaking`);
    const slots = freeSlots(p);
    if (slots.length) score += 5;
    const estimate = estimateFor(p, need);
    if (estimate?.basis === "quoted") reasons.push("price quoted");
    return {
      provider: p,
      distanceKm: video ? null : Math.round(d * 100) / 100,
      travel: travel[idx] ?? null,
      open,
      estimate,
      slots: slots.slice(0, 4),
      duplicatesMerged: p._count.mergedFrom,
      score: Math.round(score),
      reasons,
    };
  });
  results.sort((a, b) => b.score - a.score || (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  return {
    at: { ...input.at, label: input.label },
    need: { id: need.id, label: need.label, item: need.item },
    date,
    steps,
    radiusKm,
    results: results.slice(0, limit),
    excluded: excluded.filter((e) => video || e.distanceKm <= radiusKm).slice(0, 20),
  };
}
