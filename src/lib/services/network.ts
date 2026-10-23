import { randomBytes } from "node:crypto";
import type { CaseHandoff, HandoffStatus, NetworkPartner, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { round2, toEur } from "@/lib/fx";
import { withRef } from "@/lib/refs";
import { sendEmail } from "./outbox";
import { emit } from "./webhooks";

// ---------------------------------------------------------------------------
// The network between companies: handing a case to a partner (a federation
// member, a local correspondent in a resort region) with a structured pack
// and a secure link where the partner accepts it and posts updates that land
// on our case timeline; and, for insurers, the assistance companies handling
// their travellers, compared side by side.
// ---------------------------------------------------------------------------

export const HANDOFF_SCOPES = [
  "Hospital visit and daily medical updates",
  "Arrange admission and guarantee the local hospital",
  "Outpatient consultation and the bill",
  "Ground ambulance and transfer to the airport",
  "Medical escort for the flight home",
  "Repatriation of mortal remains: local paperwork",
] as const;

/** Hours a partner has to accept before we follow up. */
const RESPOND_HOURS = 2;

const appBase = () => env.publicBaseUrl || env.appUrl.replace(/\/$/, "");
export const partnerLink = (token: string) => `${appBase()}/partner/${token}`;

/** Partners that cover a country, best first (correspondents in that country, then the rest). */
export async function partnersFor(country?: string | null): Promise<NetworkPartner[]> {
  const all = await prisma.networkPartner.findMany({ where: { kind: { in: ["CORRESPONDENT", "ASSISTANCE"] } }, orderBy: { name: "asc" } });
  if (!country) return all;
  const c = country.toLowerCase();
  const covers = (p: NetworkPartner) => p.country.toLowerCase() === c || p.regions.some((r) => r.toLowerCase() === c);
  return [...all.filter(covers), ...all.filter((p) => !covers(p))];
}

export interface HandoffPack {
  caseRef: string;
  title: string;
  summary: string;
  location: string;
  priority: string;
  patient: { name: string; dateOfBirth: string; nationality: string; language: string; phone: string };
  policy: { number: string; plan: string; currency: string; remaining: number } | null;
  guarantee: { ref: string; amount: number; currency: string; status: string; hospital: string } | null;
  documents: { name: string; kind: string }[];
  instructions: string[];
  contact: string;
}

async function buildPack(caseId: string, scope: string): Promise<HandoffPack> {
  const kase = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      patient: { include: { policy: true } },
      guaranteeLetters: { orderBy: { createdAt: "desc" }, take: 1 },
      documents: { orderBy: { createdAt: "asc" }, select: { filename: true, kind: true } },
    },
  });
  if (!kase) throw notFound("Case");
  const p = kase.patient;
  const policy = p.policy;
  const letter = kase.guaranteeLetters[0];
  return {
    caseRef: kase.ref,
    title: kase.title,
    summary: kase.aiSummary ?? kase.description,
    location: [kase.location, kase.country].filter(Boolean).join(", "),
    priority: kase.priority,
    patient: { name: `${p.firstName} ${p.lastName}`, dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10), nationality: p.nationality, language: p.language, phone: p.phone },
    policy: policy ? { number: policy.number, plan: policy.plan, currency: policy.currency, remaining: round2(Number(policy.medicalLimit) - Number(policy.medicalUsed)) } : null,
    guarantee: letter ? { ref: letter.ref, amount: Number(letter.guaranteedAmount), currency: letter.currency, status: letter.status, hospital: letter.hospitalName } : null,
    documents: kase.documents.map((d) => ({ name: d.filename, kind: d.kind })),
    instructions: [
      `Scope: ${scope}.`,
      "Accept or decline within two hours; post an update after every contact with the patient or the hospital.",
      "Costs above the guarantee need our written approval first. Send invoices itemised, quoting our case reference.",
      "Medical decisions stay with the treating doctor and our medical team; share reports through the link.",
    ],
    contact: "Medical assistance desk, medical@demo-assistance.example",
  };
}

const actorOf = (by: string) => (by.startsWith("partner:") || by.startsWith("system") ? by : `operator:${by}`);

/** Hands a case to a partner: the pack, a secure link, an e-mail, and an entry on the case timeline. */
export async function handOffCase(caseId: string, partnerId: string, scope: string, by: string) {
  const partner = await prisma.networkPartner.findUnique({ where: { id: partnerId } });
  if (!partner) throw notFound("Partner");
  if (!scope.trim()) throw badRequest("Say what the partner should do.");
  const open = await prisma.caseHandoff.findFirst({ where: { caseId, partnerId, status: { in: ["SENT", "ACCEPTED", "IN_PROGRESS"] } } });
  if (open) throw conflict(`${partner.name} already has this case (${open.ref}).`);
  const pack = await buildPack(caseId, scope);
  const token = randomBytes(18).toString("base64url");
  const handoff = await withRef("handoff", (ref) =>
    prisma.caseHandoff.create({
      data: {
        ref,
        caseId,
        partnerId,
        scope,
        pack: pack as unknown as Prisma.InputJsonValue,
        token,
        sentBy: by,
        respondBy: new Date(Date.now() + RESPOND_HOURS * 3_600_000),
      },
    })
  );
  await sendEmail({
    to: `${partner.name} <${partner.email}>`,
    subject: `New case ${pack.caseRef} for ${partner.name}: ${scope}`,
    text: [
      `Dear colleagues,`,
      "",
      `We'd like to hand you case ${pack.caseRef} (${pack.title}), ${pack.location}. Priority: ${pack.priority.toLowerCase()}.`,
      `What we ask: ${scope}.`,
      "",
      `The case pack (summary, policy, guarantee, documents) and the buttons to accept, decline and post updates are here:`,
      partnerLink(token),
      "",
      `Please accept or decline within ${RESPOND_HOURS} hours.`,
      "",
      "Kind regards,",
      "Medical assistance desk",
    ].join("\n"),
    caseId,
    automatic: false,
  });
  await prisma.caseEvent.create({
    data: {
      caseId,
      type: "HANDOFF",
      title: `Handed to ${partner.name} (${handoff.ref}): ${scope}`,
      body: `Pack and secure link sent to ${partner.email}; answer due within ${RESPOND_HOURS} hours.`,
      data: { handoffRef: handoff.ref, partner: partner.name },
      actor: actorOf(by),
    },
  });
  return handoff;
}

export type PartnerAction = "ACCEPT" | "DECLINE" | "UPDATE" | "COMPLETE";

type Update = { at: string; by: string; status: HandoffStatus; note: string; eta?: string | null };

const NEXT: Record<PartnerAction, HandoffStatus> = { ACCEPT: "ACCEPTED", DECLINE: "DECLINED", UPDATE: "IN_PROGRESS", COMPLETE: "COMPLETED" };
const TITLE: Record<PartnerAction, string> = { ACCEPT: "accepted", DECLINE: "declined", UPDATE: "posted an update on", COMPLETE: "completed" };

/** What the partner sees behind its link. */
export async function handoffByToken(token: string) {
  const handoff = await prisma.caseHandoff.findUnique({ where: { token }, include: { partner: true } });
  if (!handoff) throw notFound("Hand-off");
  return handoff;
}

/** The partner accepts, declines, posts an update or completes the work; it lands on our case timeline. */
export async function partnerRespond(token: string, input: { action: PartnerAction; note?: string | null; eta?: string | null; name?: string | null }) {
  const handoff = await handoffByToken(token);
  if (handoff.status === "DECLINED" || handoff.status === "COMPLETED") throw conflict(`This hand-off is ${handoff.status.toLowerCase()}.`);
  if (input.action === "ACCEPT" && handoff.status !== "SENT") throw conflict("Already accepted.");
  if ((input.action === "UPDATE" || input.action === "COMPLETE") && handoff.status === "SENT") throw conflict("Accept the case first.");
  const note = input.note?.trim() ?? "";
  if (input.action === "UPDATE" && note.length < 3) throw badRequest("Write the update.");
  const by = `partner:${handoff.partner.name}${input.name?.trim() ? ` (${input.name.trim()})` : ""}`;
  const status = NEXT[input.action];
  const updates = [...((handoff.updates as unknown as Update[]) ?? []), { at: new Date().toISOString(), by, status, note, eta: input.eta ?? null }];
  const updated = await prisma.caseHandoff.update({
    where: { id: handoff.id },
    data: {
      status,
      updates: updates as unknown as Prisma.InputJsonValue,
      acceptedAt: input.action === "ACCEPT" ? new Date() : handoff.acceptedAt,
      completedAt: input.action === "COMPLETE" ? new Date() : handoff.completedAt,
    },
  });
  emit("handoff.updated", { ref: handoff.ref, partner: handoff.partner.name, status, note, eta: input.eta ?? null, at: new Date().toISOString() });
  await prisma.caseEvent.create({
    data: {
      caseId: handoff.caseId,
      type: "HANDOFF",
      title: `${handoff.partner.name} ${TITLE[input.action]} ${handoff.ref}`,
      body: [note, input.eta ? `ETA ${input.eta}` : null].filter(Boolean).join(" · ") || null,
      data: { handoffRef: handoff.ref, status },
      actor: by,
    },
  });
  return updated;
}

export async function caseHandoffs(caseId: string): Promise<(CaseHandoff & { partner: NetworkPartner; link: string })[]> {
  const list = await prisma.caseHandoff.findMany({ where: { caseId }, include: { partner: true }, orderBy: { createdAt: "desc" } });
  return list.map((h) => ({ ...h, link: partnerLink(h.token) }));
}

// --- Insurer oversight ------------------------------------------------------

export interface VendorScore {
  id: string;
  ref: string;
  name: string;
  country: string;
  cases: number;
  openCases: number;
  critical: number;
  /** Guaranteed and invoiced medical spend on its cases, EUR. */
  spendEur: number;
  costPerCaseEur: number | null;
  /** Bill review findings on its cases, EUR, and how much a person accepted. */
  savingsFoundEur: number;
  savingsAcceptedEur: number;
  guarantees: number;
  autoApprovedPct: number | null;
  /** Hours from a guarantee's draft to it reaching the hospital, median. */
  gopHoursMedian: number | null;
  /** Share of cases with a first contact (call, e-mail, note) within 30 minutes of opening. */
  firstContactPct: number | null;
  sla: { firstResponseMinutes?: number; gopHours?: number } | null;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** For an insurer: every assistance company handling its travellers, scored from the same records. */
export async function vendorOversight(): Promise<VendorScore[]> {
  const vendors = await prisma.networkPartner.findMany({
    where: { kind: "ASSISTANCE" },
    include: {
      vendorCases: {
        include: {
          guaranteeLetters: true,
          billReviews: true,
          events: { orderBy: { createdAt: "asc" }, take: 5, select: { type: true, createdAt: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  return vendors.map((v) => {
    const cases = v.vendorCases;
    const letters = cases.flatMap((c) => c.guaranteeLetters);
    const reviews = cases.flatMap((c) => c.billReviews);
    const eur = (n: number, ccy: string) => toEur(n, ccy) ?? 0;
    const spend = cases.reduce((sum, c) => {
      const invoiced = c.billReviews.filter((r) => r.kind === "HOSPITAL_INVOICE").reduce((s, r) => s + eur(Number(r.agreedAmount ?? r.recommended), r.currency), 0);
      const guaranteed = c.guaranteeLetters.filter((l) => ["APPROVED", "SENT", "ACKNOWLEDGED"].includes(l.status)).reduce((s, l) => s + eur(Number(l.guaranteedAmount), l.currency), 0);
      return sum + (invoiced || guaranteed);
    }, 0);
    const sent = letters.filter((l) => l.sentAt);
    const firstContacts = cases.map((c) => c.events.find((e) => ["CALL", "EMAIL", "WHATSAPP", "NOTE", "APPOINTMENT"].includes(e.type)));
    const withContact = cases.filter((c, i) => firstContacts[i] && firstContacts[i]!.createdAt.getTime() - c.createdAt.getTime() <= 30 * 60_000).length;
    return {
      id: v.id,
      ref: v.ref,
      name: v.name,
      country: v.country,
      cases: cases.length,
      openCases: cases.filter((c) => !["RESOLVED", "CLOSED"].includes(c.status)).length,
      critical: cases.filter((c) => c.priority === "CRITICAL").length,
      spendEur: round2(spend),
      costPerCaseEur: cases.length ? round2(spend / cases.length) : null,
      savingsFoundEur: round2(reviews.reduce((s, r) => s + Number(r.savingsEur ?? 0), 0)),
      savingsAcceptedEur: round2(reviews.filter((r) => r.status === "ACCEPTED").reduce((s, r) => s + Number(r.savingsEur ?? 0), 0)),
      guarantees: letters.length,
      autoApprovedPct: letters.length ? Math.round((letters.filter((l) => l.approvedBy === "system:auto-approval").length / letters.length) * 100) : null,
      gopHoursMedian: median(sent.map((l) => (l.sentAt!.getTime() - l.createdAt.getTime()) / 3_600_000)),
      firstContactPct: cases.length ? Math.round((withContact / cases.length) * 100) : null,
      sla: (v.sla as VendorScore["sla"]) ?? null,
    };
  });
}
