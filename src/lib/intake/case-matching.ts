import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Case matching for inbound e-mail and fax: a deterministic, explainable
// score. Every signal adds weight to a candidate case and a human-readable
// reason, so an operator can see *why* a message landed where it did.
// ---------------------------------------------------------------------------

export interface MatchSignals {
  /** Subject, body and all document text. */
  text: string;
  fromAddress: string | null;
  people: { patientName: string | null; dateOfBirth: string | null; policyReference: string | null; hospital: string | null }[];
}

export interface CaseCandidate {
  caseId: string;
  caseRef: string;
  patientId: string;
  score: number;
  reasons: string[];
  claimId?: string;
  claimRef?: string;
}

export const MATCH_THRESHOLD = 0.6;

const OPEN_FIRST = (a: { status: string; createdAt: Date }, b: { status: string; createdAt: Date }) => {
  const closed = (s: string) => (s === "CLOSED" || s === "RESOLVED" ? 1 : 0);
  return closed(a.status) - closed(b.status) || b.createdAt.getTime() - a.createdAt.getTime();
};

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").trim();

export async function matchCase(signals: MatchSignals): Promise<CaseCandidate[]> {
  const candidates = new Map<string, CaseCandidate>();
  const add = (
    kase: { id: string; ref: string; patientId: string },
    weight: number,
    reason: string,
    claim?: { id: string; ref: string }
  ) => {
    const c = candidates.get(kase.id) ?? { caseId: kase.id, caseRef: kase.ref, patientId: kase.patientId, score: 0, reasons: [] };
    if (!c.reasons.includes(reason)) {
      c.score = Math.min(1, c.score + weight);
      c.reasons.push(reason);
    }
    if (claim && !c.claimId) {
      c.claimId = claim.id;
      c.claimRef = claim.ref;
    }
    candidates.set(kase.id, c);
  };
  /** A patient's most relevant case (open ones first, newest first). */
  const caseOfPatient = async (patientId: string) => {
    const cases = await prisma.case.findMany({ where: { patientId }, select: { id: true, ref: true, patientId: true, status: true, createdAt: true } });
    return cases.sort(OPEN_FIRST)[0] ?? null;
  };

  // 1. References quoted in the subject, body or documents.
  for (const ref of new Set(signals.text.toUpperCase().match(/\bCASE-\d{3,6}\b/g) ?? [])) {
    const kase = await prisma.case.findUnique({ where: { ref } });
    if (kase) add(kase, 0.6, `Case reference ${ref} quoted`);
  }
  for (const ref of new Set(signals.text.toUpperCase().match(/\bCLM-\d{4,6}\b/g) ?? [])) {
    const claim = await prisma.claim.findUnique({ where: { ref } });
    if (!claim) continue;
    const kase = claim.caseId
      ? await prisma.case.findUnique({ where: { id: claim.caseId } })
      : await caseOfPatient(claim.patientId);
    if (kase) add(kase, 0.55, `Claim reference ${ref} quoted`, { id: claim.id, ref: claim.ref });
  }

  // 2–4. Who the message is about. These identify the patient; the evidence
  // then backs the cases already quoted for that patient, or — when nothing
  // was quoted — the patient's most relevant case.
  const patientEvidence = new Map<string, { weight: number; reason: string }[]>();
  const evidence = (patientId: string, weight: number, reason: string) => {
    const list = patientEvidence.get(patientId) ?? [];
    if (!list.some((e) => e.reason === reason)) list.push({ weight, reason });
    patientEvidence.set(patientId, list);
  };

  const policies = new Set([
    ...(signals.text.toUpperCase().match(/\bPOL-[A-Z]{2}-\d{4,8}\b/g) ?? []),
    ...signals.people.map((p) => p.policyReference?.toUpperCase().replace(/\s+/g, "")).filter((p): p is string => Boolean(p)),
  ]);
  for (const policyNumber of policies) {
    const patient = await prisma.patient.findUnique({ where: { policyNumber } });
    if (patient) evidence(patient.id, 0.45, `Policy ${policyNumber} belongs to ${patient.firstName} ${patient.lastName}`);
  }

  if (signals.fromAddress) {
    const patient = await prisma.patient.findFirst({ where: { email: { equals: signals.fromAddress, mode: "insensitive" } } });
    if (patient) evidence(patient.id, 0.35, `Sent from ${patient.firstName} ${patient.lastName}'s e-mail address on file`);
  }

  for (const person of signals.people) {
    if (!person.patientName) continue;
    const parts = person.patientName.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const patients = await prisma.patient.findMany({
      where: {
        firstName: { equals: parts[0], mode: "insensitive" },
        lastName: { equals: parts.slice(1).join(" "), mode: "insensitive" },
      },
    });
    for (const patient of patients) {
      evidence(patient.id, 0.25, `Patient name ${person.patientName} on the document`);
      if (person.dateOfBirth && patient.dateOfBirth.toISOString().slice(0, 10) === person.dateOfBirth.slice(0, 10)) {
        evidence(patient.id, 0.25, `Date of birth ${person.dateOfBirth} matches`);
      }
    }
  }

  for (const [patientId, items] of patientEvidence) {
    const quoted = [...candidates.values()].filter((c) => c.patientId === patientId);
    const targets = quoted.length ? quoted : [await caseOfPatient(patientId)].filter((k): k is NonNullable<typeof k> => Boolean(k));
    for (const target of targets) {
      const kase = "caseId" in target ? { id: target.caseId, ref: target.caseRef, patientId } : target;
      for (const e of items) add(kase, e.weight, e.reason);
    }
  }

  // 5. The hospital matches one where the case has an appointment.
  const hospitals = signals.people.map((p) => p.hospital).filter((h): h is string => Boolean(h)).map(norm);
  if (hospitals.length) {
    for (const c of candidates.values()) {
      const apts = await prisma.appointment.findMany({ where: { caseId: c.caseId }, include: { provider: true } });
      const hit = apts.find((a) => hospitals.some((h) => norm(a.provider.facility).includes(h) || h.includes(norm(a.provider.facility))));
      if (hit) add({ id: c.caseId, ref: c.caseRef, patientId: c.patientId }, 0.15, `Hospital ${hit.provider.facility} is treating this case`);
    }
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score);
}
