import type { Provider } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  formatPlainDate,
  isPastSlot,
  utcToZoned,
  weekdayKey,
  zonedDayRange,
  zonedToday,
} from "@/lib/time";
import { ISTANBUL_DISTRICTS, distanceKm } from "./nlu";

// ---------------------------------------------------------------------------
// ProviderSearchService: filters and scores demo providers, expanding each
// provider's weekly availability template into concrete slots so demo data
// never goes stale.
// ---------------------------------------------------------------------------

export interface ProviderSearchQuery {
  city?: string;
  district?: string;
  specialty?: string;
  date?: string; // YYYY-MM-DD
  timeOfDay?: string; // "morning" | "afternoon" | "evening" | "HH:MM"
  language?: string;
  limit?: number;
}

export interface ScoredProvider {
  provider: Provider;
  distanceKm: number | null;
  slots: { date: string; time: string }[];
  reasons: string[];
  score: number;
}

type WeeklyAvailability = Record<string, string[]>; // { mon: ["09:00", ...] }

/** Template slots for an Istanbul calendar date (wall-clock "HH:MM"). */
export function slotsForDate(provider: Pick<Provider, "availability">, date: string): string[] {
  const availability = provider.availability as WeeklyAvailability | null;
  if (!availability) return [];
  return availability[weekdayKey(date)] ?? [];
}

function inTimeOfDay(time: string, timeOfDay?: string): boolean {
  if (!timeOfDay) return true;
  const hour = Number(time.split(":")[0]);
  switch (timeOfDay) {
    case "morning":
      return hour >= 8 && hour < 12;
    case "afternoon":
      return hour >= 12 && hour < 17;
    case "evening":
      return hour >= 17 && hour <= 21;
    default: {
      // Exact time requested: match the same hour or the next slot after it.
      const wanted = Number(timeOfDay.split(":")[0]);
      return Number.isFinite(wanted) ? Math.abs(hour - wanted) <= 1 : true;
    }
  }
}

/** "2026-10-03" → "Fri 3 Oct" for human-readable match reasons. */
const friendlyDate = (date: string) => formatPlainDate(date);

export async function searchProviders(
  query: ProviderSearchQuery
): Promise<ScoredProvider[]> {
  const city = query.city?.trim() || "Istanbul";
  const date = query.date || zonedToday(1);
  const providers = await prisma.provider.findMany({
    where: { city: { equals: city, mode: "insensitive" } },
  });

  // Slots already taken on that day are not offered again.
  const day = zonedDayRange(date);
  const booked = await prisma.appointment.findMany({
    where: {
      scheduledAt: { gte: day.start, lt: day.end },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { providerId: true, scheduledAt: true },
  });
  const bookedSlots = new Set(
    booked.map((b) => `${b.providerId}|${utcToZoned(b.scheduledAt).time}`)
  );
  const now = new Date();

  const origin = query.district
    ? ISTANBUL_DISTRICTS[query.district.toLowerCase()] ?? null
    : null;

  const scored: ScoredProvider[] = [];
  for (const provider of providers) {
    const reasons: string[] = [];
    let score = 0;

    const specialtyMatch =
      !query.specialty ||
      provider.specialty.toLowerCase() === query.specialty.toLowerCase();
    if (query.specialty && specialtyMatch) {
      score += 40;
      reasons.push(`Offers the required specialty (${provider.specialty})`);
    }
    if (!specialtyMatch && provider.specialty !== "General Medicine") continue;
    if (!specialtyMatch && provider.specialty === "General Medicine") {
      score += 10;
      reasons.push("General Medicine can triage this complaint");
    }

    if (query.language) {
      const speaks = provider.languages.some(
        (l) => l.toLowerCase() === query.language!.toLowerCase()
      );
      if (!speaks) continue;
      score += 20;
      reasons.push(`${query.language}-speaking doctor`);
    }

    const allSlots = slotsForDate(provider, date).filter(
      (t) => !bookedSlots.has(`${provider.id}|${t}`) && !isPastSlot(date, t, now)
    );
    const slots = allSlots
      .filter((t) => inTimeOfDay(t, query.timeOfDay))
      .map((time) => ({ date, time }));
    if (slots.length > 0) {
      score += 25;
      reasons.push(
        query.timeOfDay
          ? `Available on ${friendlyDate(date)} in the requested time window`
          : `Available on ${friendlyDate(date)}`
      );
    } else if (allSlots.length > 0) {
      score += 8;
      reasons.push(`Available on ${friendlyDate(date)} outside the requested window`);
      slots.push(...allSlots.slice(0, 2).map((time) => ({ date, time })));
    }

    let dist: number | null = null;
    if (origin) {
      dist = distanceKm(origin, {
        lat: provider.latitude,
        lng: provider.longitude,
      });
      score += Math.max(0, 15 - dist * 2);
      if (dist <= 3) reasons.push(`Near the patient's location (~${dist} km from ${query.district})`);
      else reasons.push(`~${dist} km from ${query.district}`);
    }

    score += provider.rating * 2;
    scored.push({ provider, distanceKm: dist, slots, reasons, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, query.limit ?? 5);
}
