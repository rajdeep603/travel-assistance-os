import type { Prisma, Provider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { distanceKm } from "./nlu";

// ---------------------------------------------------------------------------
// Provider network quality: the same clinic entered twice (by two teams, two
// imports, two spellings) is found by name, phone, e-mail domain and
// location, and merged into one record with its history. A merge keeps what
// moved, so it can be audited and undone. Negotiated network rates live on
// the provider and change what bill review accepts from that hospital.
// ---------------------------------------------------------------------------

/** Clinics and hospitals still in the network: what search, booking and the assistant offer. */
export const ACTIVE_CARE_PROVIDER = { mergedIntoId: null, kind: { in: ["CLINIC", "HOSPITAL"] } } satisfies Prisma.ProviderWhereInput;

/** Negotiated rates over the reference tariff: a multiple of it, and fixed prices for some codes (EUR). */
export interface RateCard {
  name: string;
  /** The reference price times this (1.8 = 180% of the reference). */
  multiplier?: number;
  /** Fixed agreed prices per code, in EUR. */
  perCode?: Record<string, number>;
}

export function rateCardOf(provider: Pick<Provider, "rateCard"> | null | undefined): RateCard | null {
  const card = provider?.rateCard as RateCard | null | undefined;
  return card && typeof card.name === "string" ? card : null;
}

const accents = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

// Words that don't tell two facilities apart.
const NAME_NOISE = new Set([
  "demo", "the", "of", "and", "de", "del", "la", "le", "les", "dr", "dra",
  "hospital", "hosp", "hospitals", "clinic", "clinica", "clinique", "klinik", "medical", "med",
  "center", "centre", "centro", "ctr", "institute", "polyclinic", "health", "house", "practice",
  "international", "intl", "group",
]);

/** The words of a facility's name that identify it: accents, punctuation and filler removed. */
export function nameTokens(name: string): string[] {
  return accents(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NAME_NOISE.has(w));
}

const phoneDigits = (phone: string) => phone.replace(/\D/g, "").slice(-9);

/** E-mail domains shared by unrelated senders say nothing about a provider. */
const GENERIC_DOMAINS = /^(gmail|yahoo|hotmail|outlook|icloud|live|aol|mail)\./;

const domainOf = (email: string) => {
  const d = email.split("@")[1]?.toLowerCase() ?? "";
  return d && !GENERIC_DOMAINS.test(d) ? d : "";
};

const surname = (doctor: string) => accents(doctor).toLowerCase().replace(/[^a-z\s]/g, " ").trim().split(/\s+/).pop() ?? "";

export interface DuplicatePair {
  a: Provider;
  b: Provider;
  /** 0–1: how sure the rules are that these are the same provider. */
  score: number;
  reasons: string[];
  /** The record to keep by default: the one with more history, then the older one. */
  suggestedKeepId: string;
}

/** A score of this or more is shown as a likely duplicate. */
export const DUPLICATE_THRESHOLD = 0.6;

export function comparePair(a: Provider, b: Provider): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const ta = new Set(nameTokens(a.facility));
  const tb = new Set(nameTokens(b.facility));
  const shared = [...ta].filter((w) => tb.has(w)).length;
  const union = new Set([...ta, ...tb]).size;
  const nameSim = union ? shared / union : 0;
  if (nameSim > 0) {
    score += 0.45 * nameSim;
    if (nameSim >= 0.99) reasons.push(`Same name once spelling and abbreviations are set aside ("${a.facility}" / "${b.facility}")`);
    else if (nameSim >= 0.5) reasons.push(`Similar names ("${a.facility}" / "${b.facility}")`);
  }
  if (phoneDigits(a.phone) && phoneDigits(a.phone) === phoneDigits(b.phone)) {
    score += 0.25;
    reasons.push(`Same phone number, written differently (${a.phone} / ${b.phone})`);
  }
  const da = domainOf(a.email);
  if (da && da === domainOf(b.email)) {
    score += 0.15;
    reasons.push(`Same e-mail domain (${da})`);
  }
  const km = distanceKm({ lat: a.latitude, lng: a.longitude }, { lat: b.latitude, lng: b.longitude });
  if (km <= 0.5) {
    score += 0.1;
    reasons.push(km < 0.1 ? "Same location on the map" : `${Math.round(km * 1000)} m apart`);
  }
  if (surname(a.name) && surname(a.name) === surname(b.name)) {
    score += 0.05;
    reasons.push(`Same doctor's surname (${a.name} / ${b.name})`);
  }
  return { score: Math.min(1, Math.round(score * 100) / 100), reasons };
}

const historyOf = (p: Provider & { _count?: { appointments: number; guaranteeLetters: number } }) =>
  (p._count?.appointments ?? 0) + (p._count?.guaranteeLetters ?? 0);

/** Likely duplicates among the active providers, most certain first. */
export async function findDuplicates(): Promise<DuplicatePair[]> {
  const providers = await prisma.provider.findMany({
    where: { mergedIntoId: null },
    include: { _count: { select: { appointments: true, guaranteeLetters: true } } },
    orderBy: { ref: "asc" },
  });
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < providers.length; i++) {
    for (let j = i + 1; j < providers.length; j++) {
      const a = providers[i];
      const b = providers[j];
      const sameCity = a.city.toLowerCase() === b.city.toLowerCase();
      if (!sameCity && distanceKm({ lat: a.latitude, lng: a.longitude }, { lat: b.latitude, lng: b.longitude }) > 2) continue;
      const { score, reasons } = comparePair(a, b);
      if (score < DUPLICATE_THRESHOLD) continue;
      const keep = historyOf(b) > historyOf(a) || (historyOf(b) === historyOf(a) && b.createdAt < a.createdAt) ? b : a;
      pairs.push({ a, b, score, reasons, suggestedKeepId: keep.id });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}

export interface MergeMoved {
  appointments: string[];
  guaranteeLetters: string[];
  languages: string[];
  aliases: string[];
  accreditations: string[];
}

/** Merges a duplicate into the record kept: its appointments and letters move over, its names become aliases. */
export async function mergeProviders(keepId: string, removeId: string, by: string) {
  if (keepId === removeId) throw conflict("Pick two different providers to merge.");
  return prisma.$transaction(async (tx) => {
    const [keep, remove] = await Promise.all([
      tx.provider.findUnique({ where: { id: keepId } }),
      tx.provider.findUnique({ where: { id: removeId }, include: { appointments: { select: { id: true } }, guaranteeLetters: { select: { id: true } } } }),
    ]);
    if (!keep || !remove) throw notFound("Provider");
    if (keep.mergedIntoId || remove.mergedIntoId) throw conflict("One of these providers was already merged into another record.");
    const { score, reasons } = comparePair(keep, remove);

    const languages = remove.languages.filter((l) => !keep.languages.includes(l));
    const aliases = [remove.facility, remove.name, ...remove.aliases].filter((n) => n !== keep.facility && n !== keep.name && !keep.aliases.includes(n));
    const accreditations = remove.accreditations.filter((a) => !keep.accreditations.includes(a));
    const moved: MergeMoved = {
      appointments: remove.appointments.map((a) => a.id),
      guaranteeLetters: remove.guaranteeLetters.map((l) => l.id),
      languages,
      aliases,
      accreditations,
    };
    await tx.appointment.updateMany({ where: { providerId: remove.id }, data: { providerId: keep.id } });
    await tx.guaranteeLetter.updateMany({ where: { providerId: remove.id }, data: { providerId: keep.id } });
    await tx.provider.update({
      where: { id: keep.id },
      data: {
        languages: [...keep.languages, ...languages],
        aliases: [...keep.aliases, ...aliases],
        accreditations: [...keep.accreditations, ...accreditations],
        rateCard: keep.rateCard ?? (remove.rateCard as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
    await tx.provider.update({ where: { id: remove.id }, data: { mergedIntoId: keep.id } });
    return tx.providerMerge.create({
      data: { keptId: keep.id, removedId: remove.id, moved: moved as unknown as Prisma.InputJsonValue, reasons, score, mergedBy: by },
    });
  });
}

/** Puts a merged duplicate back as it was, with the appointments and letters that moved. */
export async function undoMerge(mergeId: string, by: string) {
  return prisma.$transaction(async (tx) => {
    const merge = await tx.providerMerge.findUnique({ where: { id: mergeId } });
    if (!merge) throw notFound("Merge");
    if (merge.undoneAt) throw conflict("This merge was already undone.");
    const moved = merge.moved as unknown as MergeMoved;
    const keep = await tx.provider.findUniqueOrThrow({ where: { id: merge.keptId } });
    await tx.appointment.updateMany({ where: { id: { in: moved.appointments } }, data: { providerId: merge.removedId } });
    await tx.guaranteeLetter.updateMany({ where: { id: { in: moved.guaranteeLetters } }, data: { providerId: merge.removedId } });
    await tx.provider.update({
      where: { id: keep.id },
      data: {
        languages: keep.languages.filter((l) => !moved.languages.includes(l)),
        aliases: keep.aliases.filter((a) => !moved.aliases.includes(a)),
        accreditations: keep.accreditations.filter((a) => !(moved.accreditations ?? []).includes(a)),
      },
    });
    await tx.provider.update({ where: { id: merge.removedId }, data: { mergedIntoId: null } });
    return tx.providerMerge.update({ where: { id: merge.id }, data: { undoneAt: new Date(), undoneBy: by } });
  });
}

export interface NetworkOverview {
  active: number;
  merged: number;
  accredited: number;
  withRates: number;
  countries: number;
  byKind: Record<string, number>;
  duplicates: DuplicatePair[];
  merges: { id: string; kept: Pick<Provider, "id" | "ref" | "facility">; removed: Pick<Provider, "id" | "ref" | "facility">; reasons: string[]; score: number; mergedBy: string; createdAt: Date; undoneAt: Date | null }[];
  providers: Pick<Provider, "id" | "ref" | "name" | "facility" | "city" | "country" | "kind" | "accreditations" | "rateCard" | "aliases">[];
}

export async function networkOverview(): Promise<NetworkOverview> {
  const [providers, mergedCount, duplicates, merges] = await Promise.all([
    prisma.provider.findMany({
      where: { mergedIntoId: null },
      select: { id: true, ref: true, name: true, facility: true, city: true, country: true, kind: true, accreditations: true, rateCard: true, aliases: true },
      orderBy: [{ country: "asc" }, { city: "asc" }, { facility: "asc" }],
    }),
    prisma.provider.count({ where: { mergedIntoId: { not: null } } }),
    findDuplicates(),
    prisma.providerMerge.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const ids = [...new Set(merges.flatMap((m) => [m.keptId, m.removedId]))];
  const named = new Map((await prisma.provider.findMany({ where: { id: { in: ids } }, select: { id: true, ref: true, facility: true } })).map((p) => [p.id, p]));
  const byKind: Record<string, number> = {};
  for (const p of providers) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
  return {
    active: providers.length,
    merged: mergedCount,
    accredited: providers.filter((p) => p.accreditations.length > 0).length,
    withRates: providers.filter((p) => rateCardOf(p)).length,
    countries: new Set(providers.map((p) => p.country)).size,
    byKind,
    duplicates,
    merges: merges.flatMap((m) => {
      const kept = named.get(m.keptId);
      const removed = named.get(m.removedId);
      return kept && removed ? [{ id: m.id, kept, removed, reasons: m.reasons, score: m.score, mergedBy: m.mergedBy, createdAt: m.createdAt, undoneAt: m.undoneAt }] : [];
    }),
    providers,
  };
}

/** The provider a bill comes from: the guarantee's provider, else the facility named on the invoice (aliases included). */
export async function providerForBill(input: { providerId?: string | null; hospital?: string | null }): Promise<Provider | null> {
  if (input.providerId) {
    const p = await prisma.provider.findUnique({ where: { id: input.providerId } });
    if (p) return p.mergedIntoId ? prisma.provider.findUnique({ where: { id: p.mergedIntoId } }) : p;
  }
  if (!input.hospital) return null;
  const wanted = nameTokens(input.hospital).join(" ");
  if (!wanted) return null;
  const candidates = await prisma.provider.findMany({ where: { mergedIntoId: null } });
  return candidates.find((p) => [p.facility, ...p.aliases].some((n) => nameTokens(n).join(" ") === wanted)) ?? null;
}
