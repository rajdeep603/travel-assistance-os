import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { zonedToday } from "./time";

/**
 * Human-readable reference generators (CASE-1042, CLM-10251, APT-2026-1031).
 * Each ref type draws from its own Postgres sequence, so concurrent inserts
 * never race for the same number. Seeds insert fixed refs directly, so
 * `syncRefSequences()` re-aligns every sequence with the highest ref in its
 * table; `withRef()` does that automatically if a collision slips through.
 */

const REF_SEQUENCES = {
  case: { sequence: "case_ref_seq", table: "Case", floor: 1000 },
  claim: { sequence: "claim_ref_seq", table: "Claim", floor: 10235 },
  appointment: { sequence: "appointment_ref_seq", table: "Appointment", floor: 1000 },
  patient: { sequence: "patient_ref_seq", table: "Patient", floor: 1000 },
  call: { sequence: "call_ref_seq", table: "Call", floor: 1000 },
  message: { sequence: "message_ref_seq", table: "InboundMessage", floor: 1000 },
  guarantee: { sequence: "guarantee_ref_seq", table: "GuaranteeLetter", floor: 1000 },
  transport: { sequence: "transport_ref_seq", table: "TransportPlan", floor: 1000 },
} as const;

export type RefKind = keyof typeof REF_SEQUENCES;

type RawClient = Pick<PrismaClient, "$queryRawUnsafe">;

async function nextNumber(kind: RefKind, client: RawClient = prisma): Promise<number> {
  const { sequence } = REF_SEQUENCES[kind];
  const rows = await client.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT nextval('${sequence}') AS n`
  );
  return Number(rows[0].n);
}

/** Moves every ref sequence past the highest numeric suffix in its table. */
export async function syncRefSequences(client: RawClient = prisma): Promise<void> {
  for (const { sequence, table, floor } of Object.values(REF_SEQUENCES)) {
    await client.$queryRawUnsafe(
      `SELECT setval('${sequence}', GREATEST(${floor}, COALESCE((SELECT MAX(CAST(substring(ref from '([0-9]+)$') AS INTEGER)) FROM "${table}"), ${floor})))`
    );
  }
}

const FORMATTERS: Record<RefKind, (n: number) => string> = {
  case: (n) => `CASE-${n}`,
  claim: (n) => `CLM-${n}`,
  appointment: (n) => `APT-${zonedToday().slice(0, 4)}-${n}`,
  patient: (n) => `PAT-${n}`,
  call: (n) => `CALL-${n}`,
  message: (n) => `MSG-${n}`,
  guarantee: (n) => `LOG-${n}`,
  transport: (n) => `MT-${n}`,
};

export async function nextRef(kind: RefKind, client?: RawClient): Promise<string> {
  return FORMATTERS[kind](await nextNumber(kind, client));
}

export const nextCaseRef = (client?: RawClient) => nextRef("case", client);
export const nextClaimRef = (client?: RawClient) => nextRef("claim", client);
export const nextAppointmentRef = (client?: RawClient) => nextRef("appointment", client);
export const nextPatientRef = (client?: RawClient) => nextRef("patient", client);

/** True when a Prisma error is a unique-constraint violation on `field`. */
export function isUniqueViolation(err: unknown, field?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }
  if (!field) return true;
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? "").includes(field);
}

/**
 * Runs `create` with a fresh ref. If the ref was already taken (a seed or a
 * manual insert got ahead of the sequence), re-syncs and retries once.
 */
export async function withRef<T>(kind: RefKind, create: (ref: string) => Promise<T>): Promise<T> {
  try {
    return await create(await nextRef(kind));
  } catch (err) {
    if (!isUniqueViolation(err, "ref")) throw err;
    await syncRefSequences();
    return create(await nextRef(kind));
  }
}
