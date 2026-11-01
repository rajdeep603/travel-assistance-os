import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { badRequest, notFound } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Which phone numbers AI agents may call: the configured list
// (OUTBOUND_ALLOWED_NUMBERS: toll fraud and demo safety) plus numbers an
// operator approves while the app runs, such as a prospect's own mobile at
// the booth. Every outbound call, the interpreter bridge, "ring my phone" and
// real WhatsApp sends check here.
// ---------------------------------------------------------------------------

export interface ApprovedNumberEntry {
  /** Null for a configured number: those can't be removed from the app. */
  id: string | null;
  /** E.164. */
  number: string;
  label: string | null;
  source: "configured" | "added";
}

export function normalizeNumber(n: string): string {
  return n.replace(/[^\d+]/g, "");
}

const E164 = /^\+\d{8,15}$/;

/** Configured numbers first, then the ones operators added, oldest first. */
export async function listApprovedNumbers(): Promise<ApprovedNumberEntry[]> {
  const configured: ApprovedNumberEntry[] = env.outboundAllowedNumbers.map((number) => ({ id: null, number, label: null, source: "configured" }));
  const seen = new Set(configured.map((c) => c.number));
  const added = await prisma.approvedNumber.findMany({ orderBy: { createdAt: "asc" } });
  return [...configured, ...added.filter((a) => !seen.has(a.number)).map((a) => ({ id: a.id, number: a.number, label: a.label, source: "added" as const }))];
}

export async function isAllowedNumber(n: string): Promise<boolean> {
  const number = normalizeNumber(n);
  if (!number) return false;
  if (env.outboundAllowedNumbers.includes(number)) return true;
  return Boolean(await prisma.approvedNumber.findUnique({ where: { number }, select: { id: true } }));
}

/** Approves a number (with its country code); approving it again only updates the label. */
export async function addApprovedNumber(input: { number: string; label?: string | null; addedBy?: string | null }): Promise<ApprovedNumberEntry> {
  const number = normalizeNumber(input.number);
  if (!E164.test(number)) throw badRequest("Enter the number with its country code, e.g. +90 532 123 45 67.");
  const label = input.label?.trim().slice(0, 60) || null;
  const row = await prisma.approvedNumber.upsert({
    where: { number },
    create: { number, label, addedBy: input.addedBy ?? null },
    update: label ? { label } : {},
  });
  return { id: row.id, number: row.number, label: row.label, source: "added" };
}

export async function removeApprovedNumber(id: string): Promise<void> {
  const row = await prisma.approvedNumber.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw notFound("Approved number");
  await prisma.approvedNumber.delete({ where: { id: row.id } });
}
