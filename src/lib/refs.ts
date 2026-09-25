import { prisma } from "./db";

/**
 * Human-readable reference generators (CASE-1042, CLM-10251, APT-2026-1031).
 * Refs are derived from the current maximum numeric suffix so they stay
 * stable and readable in demos. Uniqueness is enforced by the DB constraint;
 * callers retry once on collision.
 */

async function nextNumber(
  model: "case" | "claim" | "appointment" | "patient" | "provider",
  prefix: string,
  start: number
): Promise<number> {
  let refs: { ref: string }[];
  switch (model) {
    case "case":
      refs = await prisma.case.findMany({ select: { ref: true } });
      break;
    case "claim":
      refs = await prisma.claim.findMany({ select: { ref: true } });
      break;
    case "appointment":
      refs = await prisma.appointment.findMany({ select: { ref: true } });
      break;
    case "patient":
      refs = await prisma.patient.findMany({ select: { ref: true } });
      break;
    case "provider":
      refs = await prisma.provider.findMany({ select: { ref: true } });
      break;
  }
  let max = start - 1;
  for (const { ref } of refs) {
    const m = ref.match(/(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export async function nextCaseRef(): Promise<string> {
  return `CASE-${await nextNumber("case", "CASE", 1001)}`;
}

export async function nextClaimRef(): Promise<string> {
  return `CLM-${await nextNumber("claim", "CLM", 10236)}`;
}

export async function nextAppointmentRef(): Promise<string> {
  const year = new Date().getFullYear();
  return `APT-${year}-${await nextNumber("appointment", "APT", 1001)}`;
}

export async function nextPatientRef(): Promise<string> {
  return `PAT-${await nextNumber("patient", "PAT", 1001)}`;
}
