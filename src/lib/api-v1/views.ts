import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";

// ---------------------------------------------------------------------------
// What the public API returns: stable, documented shapes (not database rows),
// so a client's integration doesn't break when the platform's tables change.
// ---------------------------------------------------------------------------

const money = (n: unknown) => (n == null ? null : Number(n));

export async function caseView(ref: string) {
  const c = await prisma.case.findFirst({
    where: { ref: ref.toUpperCase() },
    include: {
      patient: true,
      guaranteeLetters: { orderBy: { createdAt: "desc" } },
      claims: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!c) throw notFound("Case");
  return {
    ref: c.ref,
    title: c.title,
    status: c.status,
    priority: c.priority,
    type: c.assistanceType,
    location: c.location,
    country: c.country,
    summary: c.aiSummary,
    patient: { ref: c.patient.ref, name: `${c.patient.firstName} ${c.patient.lastName}`, policyNumber: c.patient.policyNumber },
    guarantees: c.guaranteeLetters.map((l) => ({ ref: l.ref, status: l.status, amount: money(l.guaranteedAmount), currency: l.currency, hospital: l.hospitalName })),
    claims: c.claims.map((cl) => ({ ref: cl.ref, status: cl.status, amount: money(cl.amount), currency: cl.currency })),
    latestEvents: c.events.map((e) => ({ at: e.createdAt.toISOString(), type: e.type, title: e.title, by: e.actor })),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function guaranteeView(ref: string) {
  const l = await prisma.guaranteeLetter.findFirst({ where: { ref: ref.toUpperCase() }, include: { case: { select: { ref: true } } } });
  if (!l) throw notFound("Guarantee");
  return {
    ref: l.ref,
    case: l.case.ref,
    status: l.status,
    hospital: l.hospitalName,
    estimated: money(l.estimatedAmount),
    guaranteed: money(l.guaranteedAmount),
    excess: money(l.excess),
    currency: l.currency,
    validUntil: l.validUntil.toISOString().slice(0, 10),
    conditions: l.conditions,
    needsPersonBecause: l.flags,
    sent: l.sentAt ? { via: l.sentVia, at: l.sentAt.toISOString() } : null,
    acknowledgedAt: l.acknowledgedAt?.toISOString() ?? null,
  };
}

export async function claimView(ref: string) {
  const c = await prisma.claim.findFirst({ where: { ref: ref.toUpperCase() }, include: { case: { select: { ref: true } }, patient: true } });
  if (!c) throw notFound("Claim");
  const s = c.settlement as { payable?: number; travellerPays?: number; currency?: string; approvedBy?: string; approvedAt?: string } | null;
  return {
    ref: c.ref,
    case: c.case?.ref ?? null,
    status: c.status,
    amount: money(c.amount),
    currency: c.currency,
    patient: { ref: c.patient.ref, name: `${c.patient.firstName} ${c.patient.lastName}` },
    missing: Array.isArray(c.issues) ? (c.issues as { severity: string; message: string }[]).filter((i) => i.severity === "error").map((i) => i.message) : [],
    settlement: s ? { planPays: s.payable, travellerPays: s.travellerPays, currency: s.currency, approvedBy: s.approvedBy, approvedAt: s.approvedAt, eobDocumentId: c.eobDocumentId } : null,
  };
}
