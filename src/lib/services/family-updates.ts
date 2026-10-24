import type { OutboundMessage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { familyUpdateText, type FamilyMilestone } from "@/lib/family-update-text";
import { maskPhone } from "@/lib/format";
import { isAllowedNumber } from "./outbound-calls";
import { sendWhatsApp } from "./outbox";

// ---------------------------------------------------------------------------
// Updates to the family: the relative who called (the daughter, the husband)
// hears from us at each step on WhatsApp, instead of having to call and ask
// "where are things?". Sent automatically when the guarantee goes out and when
// the case closes, or written by a person at any time.
//
// Demo numbers are fictional, so those updates are simulated (recorded, not
// sent). A number on the outbound allowlist (the presenter's own phone) gets
// the real WhatsApp, as calls do.
// ---------------------------------------------------------------------------

export { familyUpdateText, type FamilyMilestone };

export interface FamilyContact {
  name: string | null;
  relation: string | null;
  phone: string | null;
  language: string | null;
  automatic: boolean;
}

export interface FamilyUpdate {
  id: string;
  text: string;
  at: string;
  automatic: boolean;
  /** Recorded only: a fictional demo number. */
  simulated: boolean;
  status: OutboundMessage["status"];
}

async function loadCase(caseId: string) {
  const kase = await prisma.case.findUnique({ where: { id: caseId }, include: { patient: { select: { firstName: true } } } });
  if (!kase) throw notFound("Case");
  return kase;
}

export function contactOf(kase: {
  familyContactName: string | null;
  familyContactRelation: string | null;
  familyContactPhone: string | null;
  familyContactLanguage: string | null;
  familyUpdates: boolean;
}): FamilyContact {
  return {
    name: kase.familyContactName,
    relation: kase.familyContactRelation,
    phone: kase.familyContactPhone,
    language: kase.familyContactLanguage,
    automatic: kase.familyUpdates,
  };
}

/** The contact, the updates sent so far (newest first) and a suggested next one. */
export async function familyUpdates(caseId: string): Promise<{ contact: FamilyContact; maskedPhone: string | null; updates: FamilyUpdate[]; suggestion: string }> {
  const kase = await loadCase(caseId);
  const contact = contactOf(kase);
  const sent = contact.phone
    ? await prisma.outboundMessage.findMany({
        where: { caseId, channel: "WHATSAPP", toAddress: contact.phone },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const letter = await prisma.guaranteeLetter.findFirst({ where: { caseId, status: { in: ["SENT", "ACKNOWLEDGED"] } }, orderBy: { sentAt: "desc" } });
  const ctx = { ref: kase.ref, contactName: contact.name, patientFirstName: kase.patient.firstName, hospital: letter?.hospitalName ?? null, letterRef: letter?.ref ?? null };
  const suggestion = ["RESOLVED", "CLOSED"].includes(kase.status)
    ? familyUpdateText("closed", ctx)
    : letter
      ? familyUpdateText("guarantee", ctx)
      : familyUpdateText("opened", ctx);
  return {
    contact,
    maskedPhone: contact.phone ? maskPhone(contact.phone) : null,
    updates: sent.map((m) => ({
      id: m.id,
      text: m.body,
      at: (m.sentAt ?? m.createdAt).toISOString(),
      automatic: m.automatic,
      simulated: m.provider === "mock",
      status: m.status,
    })),
    suggestion,
  };
}

/** Sends one update to the family on WhatsApp and puts it on the case timeline. */
export async function sendFamilyUpdate(caseId: string, text: string, opts: { automatic?: boolean; actor?: string | null } = {}): Promise<OutboundMessage> {
  const kase = await loadCase(caseId);
  const body = text.trim();
  if (!kase.familyContactPhone) throw badRequest("Add the family contact's phone number first.");
  if (!body) throw badRequest("Write the update first.");
  const message = await sendWhatsApp({
    to: kase.familyContactPhone,
    text: body,
    caseId,
    automatic: opts.automatic ?? false,
    approvedBy: opts.automatic ? null : (opts.actor ?? null),
    simulate: !isAllowedNumber(kase.familyContactPhone),
  });
  const who = [kase.familyContactName, kase.familyContactRelation ? `(${kase.familyContactRelation.toLowerCase()})` : null].filter(Boolean).join(" ") || "the family";
  await prisma.caseEvent.create({
    data: {
      caseId,
      type: "WHATSAPP",
      title: `Update sent to ${who} on WhatsApp`,
      body,
      actor: opts.automatic ? "AI agent" : (opts.actor ?? null),
    },
  });
  return message;
}

/**
 * The automatic update at a milestone, when the case has a family contact and
 * automatic updates are on. Never fails the step that triggered it.
 */
export async function notifyFamily(caseId: string, milestone: FamilyMilestone, extra: { hospital?: string | null; letterRef?: string | null } = {}): Promise<void> {
  try {
    const kase = await loadCase(caseId);
    if (!kase.familyUpdates || !kase.familyContactPhone) return;
    const text = familyUpdateText(milestone, { ref: kase.ref, contactName: kase.familyContactName, patientFirstName: kase.patient.firstName, ...extra });
    await sendFamilyUpdate(caseId, text, { automatic: true });
  } catch (err) {
    console.error(`[family] update at ${milestone} failed:`, err);
  }
}
