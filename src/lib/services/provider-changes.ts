import type { Provider, ProviderChangeSource } from "@prisma/client";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// The provider's change log: every field an AI call, the practice's own
// form, the team or a merge changed, with before and after. What "trust the
// network" rests on: a case manager can see who established each fact.
// ---------------------------------------------------------------------------

export const TRACKED_FIELDS = [
  "name", "facility", "specialty", "address", "district", "city", "phone", "email", "languages", "hours", "acceptsDirectBilling",
  "status", "lastVerifiedAt", "verificationNote", "priceListStatus", "internalRating", "rating", "accreditations", "mergedIntoId",
] as const;
export type TrackedField = (typeof TRACKED_FIELDS)[number];

const show = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
};

/** Writes one change row per tracked field that differs between `before` and `after`. */
export async function recordProviderChanges(providerId: string, before: Partial<Provider>, after: Partial<Provider>, source: ProviderChangeSource, actor?: string | null): Promise<number> {
  const rows: { providerId: string; field: string; before: string | null; after: string | null; source: ProviderChangeSource; actor: string | null }[] = [];
  for (const field of TRACKED_FIELDS) {
    if (!(field in after)) continue;
    const b = show(before[field]);
    const a = show(after[field]);
    if (b === a) continue;
    rows.push({ providerId, field, before: b, after: a, source, actor: actor ?? null });
  }
  if (rows.length) await prisma.providerChange.createMany({ data: rows });
  return rows.length;
}

/** Updates a provider and logs what changed. */
export async function updateProvider(id: string, data: Partial<Provider>, source: ProviderChangeSource, actor?: string | null): Promise<Provider> {
  const before = await prisma.provider.findUniqueOrThrow({ where: { id } });
  const after = await prisma.provider.update({ where: { id }, data: data as never });
  await recordProviderChanges(id, before, after, source, actor);
  return after;
}
