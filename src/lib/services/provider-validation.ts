import { randomBytes } from "node:crypto";
import type { Call, PriceItem, Prisma, Provider, ProviderStatus } from "@prisma/client";
import { BRAND } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { badRequest, notFound } from "@/lib/errors";
import { runAI } from "@/lib/services/ai";
import type { DocumentFile, PriceListReading } from "@/lib/services/types";
import type { AgentFit } from "@/lib/voice/agents/types";
import { getEmailService } from "./email";
import { placeOutboundCall } from "./outbound-calls";
import { updateProvider } from "./provider-changes";
import { PRICE_ITEM_LABELS, priceItemFromLabel, priceItemsFor } from "./provider-needs";
import { getTelephony } from "./telephony";

// ---------------------------------------------------------------------------
// Provider validation, CareTrail's own: Ada rings a practice on behalf of the
// network team, and what she learns updates the record (status, hours,
// direct billing, prices, who she spoke to) with a change log; the practice
// gets a personal link to confirm its details and send its price list, typed
// or uploaded (the AI reads it); the team rates referrals, which feeds the
// team rating. Everything a case manager sees on a provider rests on this.
// ---------------------------------------------------------------------------

export const VALIDATION_AGENT = "outbound-provider-validation";

export async function providerByRef(ref: string): Promise<Provider | null> {
  return prisma.provider.findFirst({ where: { OR: [{ ref: ref.toUpperCase() }, { id: ref }] } });
}

export function priceLinkUrl(token: string): string {
  return `${env.publicBaseUrl || "http://localhost:3000"}/p/${token}`;
}

/** A provider's personal price-list link: unguessable, the token is the credential. */
export async function createPriceLink(providerId: string): Promise<{ token: string; url: string }> {
  const token = randomBytes(18).toString("base64url");
  await prisma.providerPriceLink.create({ data: { token, providerId } });
  return { token, url: priceLinkUrl(token) };
}

export const ABOUT_CLIENT = "an assistance company that refers insured travellers and expatriates to local healthcare providers";

/** The services the agent asks the practice to confirm, from what we know of it. */
export function servicesToConfirm(p: Pick<Provider, "kind" | "specialty">): string[] {
  if (p.kind === "HOSPITAL") return ["Emergency department", `${p.specialty} department`, "X-ray and imaging", "Inpatient beds"];
  if (p.kind === "TELEMEDICINE") return ["Video consultations in English", "Prescriptions by e-mail"];
  const s = p.specialty.toLowerCase();
  if (s === "general medicine" || s === "internal medicine") return ["General practice consultations", "Blood tests", "Vaccinations"];
  if (s === "dentistry") return ["Dental exams", "Emergency dental care"];
  if (s === "pediatrics") return ["Pediatric consultations", "Vaccinations"];
  return [`${p.specialty} consultations`, "X-ray or imaging on site"];
}

/** What Ada is told before she dials: who she calls for (CareTrail), the practice, what to confirm, what to ask, the link to send. */
export function validationBrief(p: Provider, opts: { link: string; language?: string | null }): Record<string, unknown> {
  return {
    client: BRAND.name,
    about_client: `${BRAND.name} is ${ABOUT_CLIENT}; you call for its provider network team`,
    provider_name: p.facility,
    doctor_on_file: p.name,
    provider_type: p.kind === "HOSPITAL" ? "hospital" : p.kind === "TELEMEDICINE" ? "video consultation service" : "clinic",
    specialty: p.specialty,
    address: `${p.address}, ${p.district}, ${p.city}`,
    phone_called: p.phone || "unknown",
    languages_on_file: p.languages.join(", ") || "unknown",
    services_to_confirm: servicesToConfirm(p),
    prices_to_ask: priceItemsFor(p).map((i) => PRICE_ITEM_LABELS[i]),
    price_list_link: opts.link,
    reference: p.ref,
    language: opts.language ?? "English",
    note: "This is a network check, not a patient referral. Quoted prices are for self-paying patients unless they say otherwise; note the currency (Turkish lira, euro or US dollar).",
  };
}

/** Whether a provider record gives the agent something to call about. */
export async function validationFit(record?: string | null): Promise<AgentFit> {
  const p = record ? await providerByRef(record) : null;
  if (!p) return { ready: false, why: record ? `${record.toUpperCase()} isn't a provider on file.` : "Pick a provider to validate.", record: null };
  if (p.mergedIntoId) return { ready: false, why: `${p.ref} was merged into another record.`, record: p.ref };
  if (!p.phone) return { ready: false, why: `${p.ref} has no phone number on file.`, record: p.ref };
  return { ready: true, why: "", record: `${p.ref} · ${p.facility}` };
}

export async function validationRecordBrief(record?: string | null): Promise<Record<string, unknown>> {
  const p = record ? await providerByRef(record) : null;
  if (!p) throw badRequest("Pick a provider to validate.");
  const link = await createPriceLink(p.id);
  return validationBrief(p, { link: link.url });
}

/** Places the validation call about a provider (operator action; allowlisted numbers only). */
export async function placeValidationCall(input: { ref: string; to: string; language?: string | null; placedBy: string | null }): Promise<Call> {
  const p = await providerByRef(input.ref);
  if (!p) throw notFound("Provider");
  const link = await createPriceLink(p.id);
  return placeOutboundCall({
    profileId: VALIDATION_AGENT,
    to: input.to,
    language: input.language,
    placedBy: input.placedBy,
    record: p.ref,
    brief: validationBrief(p, { link: link.url, language: input.language }),
    extraOutcome: { providerRef: p.ref, providerId: p.id, priceLinkToken: link.token },
  });
}

interface Validation {
  reached_right_place?: boolean;
  operating?: boolean | null;
  closed_or_moved?: string;
  new_address?: string;
  hours?: string;
  services_confirmed?: string[];
  services_not_offered?: string[];
  accepts_international_patients?: boolean | null;
  accepts_direct_billing?: boolean | null;
  prices?: { item: string; amount: number; currency: string; note?: string }[];
  contact_name?: string;
  contact_role?: string;
  contact_email?: string;
  contact_mobile?: string;
  notes?: string;
}

/** The model sometimes fills optional fields with "none" or "not given": those are absences. */
const PLACEHOLDER = /^\s*(none|n\/a|na|unknown|not given|none given|not provided|not stated|-+)?\s*\.?\s*$/i;
export function cleanValidation(v: Validation | null | undefined): Validation | null {
  if (!v) return null;
  const out: Validation = { ...v };
  for (const key of ["closed_or_moved", "new_address", "hours", "contact_name", "contact_role", "contact_email", "contact_mobile", "notes"] as const) {
    const value = out[key];
    if (typeof value === "string" && PLACEHOLDER.test(value)) delete out[key];
  }
  return out;
}

/** What a validation's answers do to the record: closed beats moved beats verified; a wrong number is "unreachable" until someone checks it. */
export function statusFromValidation(v: Validation): ProviderStatus | null {
  if (v.reached_right_place && v.operating === false) return "CLOSED";
  if (v.reached_right_place === false && v.operating === false && v.closed_or_moved) return "CLOSED";
  if (v.reached_right_place && v.new_address) return "MOVED";
  if (v.reached_right_place && v.operating) return "VERIFIED";
  if (v.reached_right_place === false) return "UNREACHABLE";
  return null;
}

const providerOfCall = async (call: Call): Promise<Provider | null> => {
  const outcome = (call.outcome ?? {}) as { providerId?: string; providerRef?: string };
  if (outcome.providerId) return prisma.provider.findUnique({ where: { id: outcome.providerId } });
  if (outcome.providerRef) return providerByRef(outcome.providerRef);
  return null;
};

/** After the call: what the practice said becomes the record, with the call as the change log's actor. */
export async function applyValidationCall(callId: string): Promise<void> {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call || call.agentProfile !== VALIDATION_AGENT) return;
  const p = await providerOfCall(call);
  if (!p) return;
  const outcome = (call.outcome ?? {}) as Record<string, unknown>;
  const v = cleanValidation(outcome.providerValidation as Validation | null);
  const linkSent = (outcome.priceLinkSent ?? null) as { channel?: string; to?: string; sent?: boolean } | null;
  const data: Partial<Provider> = {};
  let status: ProviderStatus | null = null;
  if (v) {
    status = statusFromValidation(v);
    if (v.hours) data.hours = v.hours.slice(0, 120);
    if (v.accepts_direct_billing != null) data.acceptsDirectBilling = v.accepts_direct_billing;
    if (v.contact_email && !p.email) data.email = v.contact_email;
    const noteParts = [
      v.contact_name ? `Spoke to ${v.contact_name}${v.contact_role ? ` (${v.contact_role})` : ""}.` : null,
      v.services_confirmed?.length ? `Confirmed: ${v.services_confirmed.join(", ")}.` : null,
      v.services_not_offered?.length ? `Not offered: ${v.services_not_offered.join(", ")}.` : null,
      v.accepts_international_patients === false ? "Does not see international patients." : null,
      v.closed_or_moved ? `${v.closed_or_moved.replace(/\.$/, "")}.` : null,
      v.new_address ? `New address: ${v.new_address}.` : null,
      v.notes ? v.notes : null,
    ].filter(Boolean);
    if (noteParts.length) data.verificationNote = noteParts.join(" ").slice(0, 600);
    for (const q of v.prices ?? []) {
      const item = priceItemFromLabel(q.item);
      if (!item || !(Number(q.amount) > 0)) continue;
      await prisma.providerPrice.create({
        data: { providerId: p.id, item, amount: Number(q.amount), currency: (q.currency || "EUR").toUpperCase().slice(0, 3), source: "CALL", note: q.note ?? `quoted on ${call.ref}` },
      });
    }
  } else if (["NO_ANSWER", "BUSY", "VOICEMAIL", "FAILED"].includes(call.status)) {
    status = "UNREACHABLE";
  }
  if (status) {
    data.status = status;
    if (status !== "UNREACHABLE") data.lastVerifiedAt = new Date();
  }
  if (!data.verificationNote && call.summary) data.verificationNote = call.summary.slice(0, 600);
  if (linkSent?.sent) {
    data.priceListStatus = p.priceListStatus === "RECEIVED" ? "RECEIVED" : "LINK_SENT";
    const token = outcome.priceLinkToken as string | undefined;
    if (token) await prisma.providerPriceLink.updateMany({ where: { token, sentAt: null }, data: { sentVia: linkSent.channel ?? "sms", sentTo: linkSent.to ?? null, sentAt: new Date() } });
  }
  if (Object.keys(data).length) await updateProvider(p.id, data, "CALL", call.ref);
}

/** The carrier said nobody answered (or the line was busy or failed) before the agent spoke: the record is unreachable until someone checks the number. */
export async function markValidationUnreachable(callId: string): Promise<void> {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call || call.agentProfile !== VALIDATION_AGENT) return;
  const outcome = (call.outcome ?? {}) as Record<string, unknown>;
  if (outcome.providerValidation) return;
  const p = await providerOfCall(call);
  if (!p || p.status === "CLOSED") return;
  await updateProvider(p.id, { status: "UNREACHABLE", verificationNote: `No answer on ${call.ref} (${call.status.toLowerCase().replace(/_/g, " ")}).` }, "CALL", call.ref);
}

/** Sends a practice its personal price-list link by text message or e-mail (or only creates it, for a QR code on screen). */
export async function sendPriceLink(p: Provider, channel: "sms" | "email" | "none", to?: string | null, by?: string | null): Promise<{ url: string; token: string; sent: boolean; reason: string | null }> {
  const link = await createPriceLink(p.id);
  const text = `${BRAND.name}: thank you for working with our provider network. Please confirm your practice details and share your prices here: ${link.url}`;
  let sent = false;
  let reason: string | null = null;
  if (channel === "sms") {
    const telephony = getTelephony();
    if (!to) reason = "Enter a mobile number.";
    else if (!telephony.configured) reason = "Text messages aren't set up on this server.";
    else {
      try {
        await telephony.sendSms(to.replace(/[^\d+]/g, ""), text);
        sent = true;
      } catch (err) {
        reason = err instanceof Error ? err.message.slice(0, 200) : "sending failed";
      }
    }
  } else if (channel === "email") {
    const email = getEmailService();
    if (!to) reason = "Enter an e-mail address.";
    else if (!email.configured) reason = "E-mail isn't set up on this server.";
    else {
      try {
        await email.send({ to, subject: `${BRAND.name}: your practice details and price list`, text: `${text}\n\nThe link is personal to your practice and works on a phone.` });
        sent = true;
      } catch (err) {
        reason = err instanceof Error ? err.message.slice(0, 200) : "sending failed";
      }
    }
  }
  if (sent) {
    await prisma.providerPriceLink.update({ where: { token: link.token }, data: { sentVia: channel, sentTo: to ?? null, sentAt: new Date() } });
    if (p.priceListStatus === "NONE") await updateProvider(p.id, { priceListStatus: "LINK_SENT" }, "TEAM", by);
  }
  return { url: link.url, token: link.token, sent, reason };
}

/** What the practice sees on its link: who is asking, what we have, which prices to fill in. */
export async function priceLinkInfo(token: string) {
  const link = await prisma.providerPriceLink.findUnique({ where: { token }, include: { provider: true } });
  if (!link) throw notFound("Link");
  if (!link.openedAt) await prisma.providerPriceLink.update({ where: { id: link.id }, data: { openedAt: new Date() } });
  const items = priceItemsFor(link.provider);
  const extra = (["CONSULTATION", "XRAY", "BLOOD_PANEL"] as PriceItem[]).filter((i) => !items.includes(i));
  const p = link.provider;
  return {
    client: { name: BRAND.name, about: ABOUT_CLIENT, poweredBy: BRAND.poweredBy },
    provider: { ref: p.ref, facility: p.facility, name: p.name, specialty: p.specialty, address: p.address, district: p.district, city: p.city, phone: p.phone, email: p.email, hours: p.hours, acceptsDirectBilling: p.acceptsDirectBilling, languages: p.languages },
    items: [...items, ...extra].map((i) => ({ id: i, label: PRICE_ITEM_LABELS[i] })),
    submittedAt: link.submittedAt,
  };
}

export interface PriceLinkSubmission {
  confirmed: boolean;
  hours?: string;
  acceptsDirectBilling?: boolean | null;
  email?: string;
  contactName?: string;
  notes?: string;
  currency?: string;
  prices: { item: string; amount: number; currency?: string }[];
}

/** The practice's answer: confirmed details, prices typed in, and/or a price list uploaded (read by the AI). */
export async function submitPriceLink(token: string, submission: PriceLinkSubmission, file?: DocumentFile | null) {
  const link = await prisma.providerPriceLink.findUnique({ where: { token }, include: { provider: true } });
  if (!link) throw notFound("Link");
  let extracted: PriceListReading | null = null;
  if (file) {
    extracted = await runAI("readPriceList", (svc) => svc.readPriceList(file, Object.values(PRICE_ITEM_LABELS))).then((r) => r.value).catch(() => ({ prices: [], note: "The file was kept, but no prices could be read from it." }));
  }
  const currency = (submission.currency || "EUR").toUpperCase().slice(0, 3);
  const prices: { item: PriceItem; amount: number; currency: string; source: "FORM" | "UPLOAD"; note: string | null }[] = [];
  for (const q of submission.prices) {
    const item = priceItemFromLabel(q.item);
    if (item && q.amount > 0) prices.push({ item, amount: q.amount, currency: (q.currency || currency).toUpperCase().slice(0, 3), source: "FORM", note: null });
  }
  for (const q of extracted?.prices ?? []) {
    const item = priceItemFromLabel(q.item);
    if (item && q.amount > 0) prices.push({ item, amount: q.amount, currency: (q.currency || currency).toUpperCase().slice(0, 3), source: "UPLOAD", note: q.note ?? "read from the uploaded price list" });
  }
  for (const q of prices) await prisma.providerPrice.create({ data: { providerId: link.providerId, item: q.item, amount: q.amount, currency: q.currency, source: q.source, note: q.note } });
  await prisma.providerPriceLink.update({
    where: { id: link.id },
    data: { submittedAt: new Date(), submission: submission as unknown as Prisma.InputJsonValue, uploadName: file?.filename ?? null, extracted: extracted ? (extracted as unknown as Prisma.InputJsonValue) : undefined },
  });
  const data: Partial<Provider> = {};
  if (prices.length || file) data.priceListStatus = "RECEIVED";
  if (submission.hours) data.hours = submission.hours.slice(0, 120);
  if (submission.acceptsDirectBilling != null) data.acceptsDirectBilling = submission.acceptsDirectBilling;
  if (submission.email) data.email = submission.email;
  if (submission.confirmed) {
    data.verificationNote = `Details confirmed by the practice through its link${submission.contactName ? ` (${submission.contactName})` : ""}.${submission.notes ? ` ${submission.notes}` : ""}`.slice(0, 600);
    if (link.provider.status === "UNVERIFIED" || link.provider.status === "UNREACHABLE") {
      data.status = "VERIFIED";
      data.lastVerifiedAt = new Date();
    }
  }
  if (Object.keys(data).length) await updateProvider(link.providerId, data, "FORM", submission.contactName ?? "the practice");
  return { prices: prices.filter((q) => q.source === "FORM").length, extracted: prices.filter((q) => q.source === "UPLOAD").length, note: extracted?.note ?? null };
}

/** Everything the provider page shows: the record, prices, links, change log, feedback and the validation calls about it. */
export async function providerDetail(ref: string) {
  const p = await prisma.provider.findFirst({
    where: { OR: [{ ref: ref.toUpperCase() }, { id: ref }] },
    include: {
      prices: { orderBy: { collectedAt: "desc" } },
      priceLinks: { orderBy: { createdAt: "desc" }, take: 5 },
      changes: { orderBy: { createdAt: "desc" }, take: 40 },
      feedback: { orderBy: { createdAt: "desc" }, take: 20 },
      mergedFrom: { select: { ref: true, facility: true, name: true } },
      mergedInto: { select: { ref: true, facility: true } },
      _count: { select: { appointments: true, guaranteeLetters: true } },
    },
  });
  if (!p) throw notFound("Provider");
  const calls = await prisma.call.findMany({
    where: { agentProfile: VALIDATION_AGENT, OR: [{ outcome: { path: ["providerId"], equals: p.id } }, { outcome: { path: ["providerRef"], equals: p.ref } }] },
    orderBy: { startedAt: "desc" },
    take: 10,
    select: { id: true, ref: true, status: true, startedAt: true, endedAt: true, durationSec: true, summary: true, outcome: true, language: true },
  });
  return {
    ...p,
    calls: calls.map((c) => ({ ...c, outcome: { providerValidation: (c.outcome as { providerValidation?: unknown } | null)?.providerValidation ?? null, priceLinkSent: (c.outcome as { priceLinkSent?: unknown } | null)?.priceLinkSent ?? null } })),
  };
}

/** "How did the referral go?": the last ten ratings make the team rating. */
export async function addProviderFeedback(providerId: string, input: { rating: number; comment?: string | null; by?: string | null; caseRef?: string | null }) {
  await prisma.providerFeedback.create({ data: { providerId, rating: input.rating, comment: input.comment ?? null, by: input.by ?? null, caseRef: input.caseRef ?? null } });
  const last = await prisma.providerFeedback.findMany({ where: { providerId }, orderBy: { createdAt: "desc" }, take: 10 });
  const avg = Math.round((last.reduce((n, f) => n + f.rating, 0) / last.length) * 10) / 10;
  return updateProvider(providerId, { internalRating: avg }, "TEAM", input.by);
}

/** The team's own verdict on a record. */
export async function setProviderStatus(providerId: string, status: ProviderStatus, actor?: string | null, note?: string | null) {
  const data: Partial<Provider> = { status };
  if (status === "VERIFIED") data.lastVerifiedAt = new Date();
  if (note) data.verificationNote = note.slice(0, 600);
  return updateProvider(providerId, data, "TEAM", actor);
}
