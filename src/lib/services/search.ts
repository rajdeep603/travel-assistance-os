import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAgent } from "@/lib/voice/agents/registry";

// ---------------------------------------------------------------------------
// Global search behind the command palette (⌘K): one query across cases,
// travellers, claims, calls, inbox messages, guarantee letters, transport
// plans, documents and appointments. A reference typed exactly (CASE-1022,
// LOG-0902) comes first; names match word by word ("lena koch").
// ---------------------------------------------------------------------------

export type SearchKind = "case" | "traveller" | "claim" | "call" | "message" | "guarantee" | "transport" | "document" | "appointment";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  ref: string;
  title: string;
  subtitle: string;
  href: string;
  status?: string;
}

const insensitive = (value: string) => ({ contains: value, mode: "insensitive" as const });
const human = (s: string) => s.replace(/_/g, " ").toLowerCase();

/** Every word appears in the first or last name. */
function personWhere(words: string[]): Prisma.PatientWhereInput {
  return { AND: words.map((w) => ({ OR: [{ firstName: insensitive(w) }, { lastName: insensitive(w) }] })) };
}

export async function globalSearch(query: string, perKind = 5): Promise<SearchHit[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const words = q.split(/\s+/).filter((w) => w.length > 1).slice(0, 4);
  const person = personWhere(words.length ? words : [q]);
  const take = perKind;

  const [cases, patients, claims, calls, messages, letters, plans, documents, appointments] = await Promise.all([
    prisma.case.findMany({
      where: { OR: [{ ref: insensitive(q) }, { title: insensitive(q) }, { location: insensitive(q) }, { patient: person }] },
      include: { patient: { select: { firstName: true, lastName: true } } },
      orderBy: { updatedAt: "desc" },
      take,
    }),
    prisma.patient.findMany({
      where: { OR: [{ ref: insensitive(q) }, { policyNumber: insensitive(q) }, { email: insensitive(q) }, person] },
      include: { cases: { orderBy: { updatedAt: "desc" }, take: 1, select: { id: true, ref: true } } },
      take,
    }),
    prisma.claim.findMany({
      where: { OR: [{ ref: insensitive(q) }, { patient: person }] },
      include: { patient: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.call.findMany({
      where: { OR: [{ ref: insensitive(q) }, { summary: insensitive(q) }, { agentProfile: insensitive(q) }, { case: { patient: person } }] },
      orderBy: { startedAt: "desc" },
      take,
    }),
    prisma.inboundMessage.findMany({
      where: { OR: [{ ref: insensitive(q) }, { subject: insensitive(q) }, { fromAddress: insensitive(q) }] },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.guaranteeLetter.findMany({
      where: { OR: [{ ref: insensitive(q) }, { hospitalName: insensitive(q) }, { case: { patient: person } }] },
      include: { case: { select: { ref: true, patient: { select: { firstName: true, lastName: true } } } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.transportPlan.findMany({
      where: { OR: [{ ref: insensitive(q) }, { case: { patient: person } }] },
      include: { case: { select: { ref: true, patient: { select: { firstName: true, lastName: true } } } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.document.findMany({
      where: {
        OR: [{ filename: insensitive(q) }, { extraction: { documentNumber: insensitive(q) } }, { extraction: { patientName: insensitive(q) } }],
        AND: [{ OR: [{ caseId: { not: null } }, { claimId: { not: null } }] }],
      },
      include: { extraction: { select: { documentNumber: true } }, claim: { select: { ref: true } }, case: { select: { ref: true } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.appointment.findMany({
      where: { OR: [{ ref: insensitive(q) }, { patient: person }] },
      include: { provider: { select: { name: true, facility: true } }, patient: { select: { firstName: true, lastName: true } } },
      orderBy: { scheduledAt: "desc" },
      take,
    }),
  ]);

  const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
  const hits: SearchHit[] = [
    ...cases.map((c) => ({ kind: "case" as const, id: c.id, ref: c.ref, title: c.title, subtitle: `${name(c.patient)} · ${human(c.status)}`, href: `/cases/${c.id}`, status: c.status })),
    ...patients.map((p) => ({
      kind: "traveller" as const,
      id: p.id,
      ref: p.ref,
      title: name(p),
      subtitle: `${p.policyNumber} · ${p.nationality}${p.cases[0] ? ` · ${p.cases[0].ref}` : ""}`,
      href: p.cases[0] ? `/cases/${p.cases[0].id}` : "/cases",
    })),
    ...claims.map((c) => ({ kind: "claim" as const, id: c.id, ref: c.ref, title: `Claim ${c.ref}`, subtitle: `${name(c.patient)} · ${human(c.status)}`, href: `/claims/${c.ref}`, status: c.status })),
    ...calls.map((c) => ({
      kind: "call" as const,
      id: c.id,
      ref: c.ref,
      title: getAgent(c.agentProfile)?.label ?? c.agentProfile,
      subtitle: (c.summary ?? `${human(c.channel)} · ${human(c.status)}`).slice(0, 120),
      href: `/calls/${c.id}`,
      status: c.status,
    })),
    ...messages.map((m) => ({
      kind: "message" as const,
      id: m.id,
      ref: m.ref,
      title: m.subject ?? `${m.channel === "FAX" ? "Fax" : "E-mail"} from ${m.fromAddress}`,
      subtitle: `${m.fromAddress} · ${human(m.status)}`,
      href: `/inbox?message=${m.id}`,
      status: m.status,
    })),
    ...letters.map((l) => ({
      kind: "guarantee" as const,
      id: l.id,
      ref: l.ref,
      title: `${l.ref} · ${Number(l.guaranteedAmount).toLocaleString("en-GB")} ${l.currency}`,
      subtitle: `${l.hospitalName} · ${name(l.case.patient)} · ${human(l.status)}`,
      href: `/cases/${l.caseId}`,
      status: l.status,
    })),
    ...plans.map((t) => ({ kind: "transport" as const, id: t.id, ref: t.ref, title: `Transport ${t.ref}`, subtitle: `${name(t.case.patient)} · ${human(t.mode)}`, href: `/cases/${t.caseId}` })),
    ...documents.map((d) => ({
      kind: "document" as const,
      id: d.id,
      ref: d.extraction?.documentNumber ?? d.filename,
      title: d.filename,
      subtitle: [human(d.kind), d.case?.ref, d.claim?.ref].filter(Boolean).join(" · "),
      href: d.caseId ? `/cases/${d.caseId}` : `/claims/${d.claim!.ref}`,
    })),
    ...appointments.map((a) => ({
      kind: "appointment" as const,
      id: a.id,
      ref: a.ref,
      title: `${a.ref} · ${a.provider.name}`,
      subtitle: `${name(a.patient)} · ${a.provider.facility} · ${human(a.status)}`,
      href: a.caseId ? `/cases/${a.caseId}` : "/cases",
      status: a.status,
    })),
  ];

  // An exact reference first, then references that start with the query, then the rest in kind order.
  const upper = q.toUpperCase();
  const rank = (h: SearchHit) => (h.ref.toUpperCase() === upper ? 0 : h.ref.toUpperCase().startsWith(upper) ? 1 : 2);
  return hits.map((h, i) => ({ h, i })).sort((a, b) => rank(a.h) - rank(b.h) || a.i - b.i).map(({ h }) => h);
}
