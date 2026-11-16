import fs from "node:fs/promises";
import path from "node:path";
import type { Document, DocumentExtraction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, badRequest, notFound } from "@/lib/errors";
import { receiveSample, type SampleKind } from "@/lib/intake/simulate";
import { deleteDocument } from "@/lib/services/erase";
import { processDocument } from "@/lib/services/document-extraction";
import { createSampleClaim } from "@/lib/services/sample-claim";
import { recommendSettlement } from "@/lib/services/settlement";
import { kitOf } from "./kit";

// ---------------------------------------------------------------------------
// The rest of the platform in a partner demo portal: the inbox, Document AI
// and claims, each run on the kit's fictional samples through the real
// pipelines (offline rules, so figures hold). A portal sees only what it ran
// itself: every run is logged with the ids it made (INBOX_RUN, DOC_RUN,
// CLAIM_RUN), and a new run of the same sample replaces its previous copy.
// ---------------------------------------------------------------------------

export const MODULE_RUN_TYPES = ["INBOX_RUN", "DOC_RUN", "CLAIM_RUN"] as const;
const RUNS_PER_HOUR = 30;

type RunType = (typeof MODULE_RUN_TYPES)[number];
type Detail = { sample?: string; messageId?: string; documentId?: string; claimId?: string };

async function runs(portalId: string, type: RunType): Promise<Detail[]> {
  const events = await prisma.demoPortalEvent.findMany({ where: { portalId, type }, orderBy: { createdAt: "desc" }, select: { detail: true } });
  return events.map((e) => (e.detail ?? {}) as Detail);
}

/** The latest run of each sample, newest first. */
function latestPerSample(details: Detail[]): Detail[] {
  const seen = new Set<string>();
  return details.filter((d) => {
    const key = d.sample ?? "";
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function assertRunBudget(portalId: string): Promise<void> {
  const recent = await prisma.demoPortalEvent.count({
    where: { portalId, type: { in: [...MODULE_RUN_TYPES] }, createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
  if (recent >= RUNS_PER_HOUR) throw new ApiError("That's enough runs for this hour. The last results are still shown.", 429, "TOO_MANY_RUNS");
}

/** Whether a document came out of one of this portal's runs (so its files may be opened from the portal). */
export async function portalOwnsDocument(portalId: string, doc: Pick<Document, "id" | "inboundMessageId" | "claimId">): Promise<boolean> {
  const events = await prisma.demoPortalEvent.findMany({ where: { portalId, type: { in: [...MODULE_RUN_TYPES] } }, select: { detail: true } });
  return events.some((e) => {
    const d = (e.detail ?? {}) as Detail;
    return d.documentId === doc.id || (d.messageId != null && d.messageId === doc.inboundMessageId) || (d.claimId != null && d.claimId === doc.claimId);
  });
}

// ---- What the portal shows -------------------------------------------------

type DocWithExtraction = Document & { extraction: DocumentExtraction | null };
const BILLS = new Set<string>(["HOSPITAL_INVOICE", "COST_ESTIMATE"]);

function documentView(d: DocWithExtraction) {
  const e = d.extraction;
  return {
    id: d.id,
    filename: d.filename,
    kind: d.kind,
    status: d.status,
    error: d.error,
    ocr: d.ocr,
    language: d.language,
    original: d.textContent,
    english: d.translatedText,
    read: e
      ? {
          patientName: e.patientName,
          dateOfBirth: e.dateOfBirth,
          policyReference: e.policyReference,
          hospital: e.hospital,
          doctor: e.doctor,
          diagnosis: e.diagnosis,
          symptoms: e.symptoms,
          procedures: e.procedures,
          medications: e.medications,
          admissionDate: e.admissionDate,
          dischargeDate: e.dischargeDate,
          amount: e.invoiceAmount != null ? Number(e.invoiceAmount) : null,
          currency: e.currency,
          summary: e.summary,
          // A report has no amount to find; only bills and estimates miss one.
          missingInfo: BILLS.has(d.kind) ? e.missingInfo : e.missingInfo.filter((x) => !/invoice amount/i.test(x)),
          confidence: e.confidence,
        }
      : null,
  };
}
export type PortalDocumentView = ReturnType<typeof documentView>;

async function inboxView(messageId: string) {
  const m = await prisma.inboundMessage.findUnique({
    where: { id: messageId },
    include: {
      matchedCase: { select: { ref: true, title: true } },
      documents: { include: { extraction: true }, orderBy: { createdAt: "asc" } },
      replies: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!m) return null;
  const reasons = Array.isArray(m.matchReasons) ? ((m.matchReasons as { reasons?: string[] }[])[0]?.reasons ?? []) : [];
  return {
    ref: m.ref,
    channel: m.channel,
    from: m.fromAddress,
    subject: m.subject,
    body: m.bodyText,
    receivedAt: m.receivedAt.toISOString(),
    language: m.language,
    english: m.translatedText,
    status: m.status,
    summary: m.summary,
    riskFlags: m.riskFlags,
    matchedCase: m.matchedCase ? { ref: m.matchedCase.ref, title: m.matchedCase.title, confidence: m.matchConfidence, reasons } : null,
    documents: m.documents.map(documentView),
    replies: m.replies.map((r) => ({ channel: r.channel, to: r.toAddress, subject: r.subject, body: r.body, status: r.status, automatic: r.automatic })),
  };
}
export type PortalInboxView = NonNullable<Awaited<ReturnType<typeof inboxView>>>;

async function claimView(claimId: string) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { patient: { include: { policy: true } }, documents: { include: { extraction: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!claim) return null;
  const settlement = await recommendSettlement(claim.id).catch(() => null);
  return {
    ref: claim.ref,
    status: claim.status,
    createdAt: claim.createdAt.toISOString(),
    patient: `${claim.patient.firstName} ${claim.patient.lastName}`,
    policy: claim.patient.policy ? { number: claim.patient.policy.number, plan: claim.patient.policy.plan } : null,
    // The model sometimes writes markdown emphasis; the portal shows plain text.
    summary: claim.summary?.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1") ?? null,
    amount: claim.amount != null ? Number(claim.amount) : null,
    currency: claim.currency,
    issues: (Array.isArray(claim.issues) ? claim.issues : []) as { severity: string; message: string }[],
    signals: (Array.isArray(claim.signals) ? claim.signals : []) as { code: string; level: string; reason: string }[],
    documents: claim.documents.map(documentView),
    settlement,
  };
}
export type PortalClaimView = NonNullable<Awaited<ReturnType<typeof claimView>>>;

// ---- Runs -------------------------------------------------------------------

const CHANNEL_KIND: Record<string, SampleKind> = { email: "email", fax: "fax", whatsapp: "whatsapp" };

export async function inboxRuns(portalId: string): Promise<(PortalInboxView & { sample: string })[]> {
  const out: (PortalInboxView & { sample: string })[] = [];
  for (const d of latestPerSample(await runs(portalId, "INBOX_RUN"))) {
    const view = d.messageId ? await inboxView(d.messageId) : null;
    if (view && d.sample) out.push({ ...view, sample: d.sample });
  }
  return out;
}

/** Receives one of the kit's sample messages through the real intake pipeline. */
export async function runInboxSample(portal: { id: string; kit: string }, sample: string): Promise<{ view: PortalInboxView; messageId: string }> {
  const card = kitOf(portal.kit)?.modules.inbox.find((s) => s.id === sample);
  if (!card) throw badRequest("Unknown sample.");
  const message = await receiveSample(CHANNEL_KIND[card.channel], card.id);
  const view = await inboxView(message.id);
  if (!view) throw notFound("Message");
  return { view, messageId: message.id };
}

export async function documentRuns(portalId: string): Promise<(PortalDocumentView & { sample: string })[]> {
  const out: (PortalDocumentView & { sample: string })[] = [];
  for (const d of latestPerSample(await runs(portalId, "DOC_RUN"))) {
    const doc = d.documentId ? await prisma.document.findUnique({ where: { id: d.documentId }, include: { extraction: true } }) : null;
    if (doc && d.sample) out.push({ ...documentView(doc), sample: d.sample });
  }
  return out;
}

/** Reads one of the kit's sample files with Document AI; the portal's previous copy of it goes. */
export async function runDocumentSample(portal: { id: string; kit: string }, file: string): Promise<PortalDocumentView> {
  const card = kitOf(portal.kit)?.modules.documents.find((s) => s.file === file);
  if (!card) throw badRequest("Unknown sample.");
  for (const d of await runs(portal.id, "DOC_RUN")) {
    if (d.sample === file && d.documentId) await deleteDocument(d.documentId).catch(() => undefined);
  }
  const buffer = await fs.readFile(path.join(process.cwd(), "public", card.file));
  const doc = await prisma.document.create({
    data: {
      filename: path.basename(card.file),
      mimeType: "application/pdf",
      sizeBytes: buffer.length,
      status: "UPLOADED",
      storagePath: card.file,
    },
  });
  try {
    await processDocument(doc.id, buffer);
  } catch {
    // The document keeps its FAILED status and error, which the portal shows.
  }
  const done = await prisma.document.findUniqueOrThrow({ where: { id: doc.id }, include: { extraction: true } });
  return documentView(done);
}

export async function claimRun(portalId: string): Promise<PortalClaimView | null> {
  const [latest] = await runs(portalId, "CLAIM_RUN");
  return latest?.claimId ? claimView(latest.claimId) : null;
}

/** A portal claim and everything read for it (it was never approved, so there is no EOB). */
async function removeClaim(claimId: string): Promise<void> {
  const docs = await prisma.document.findMany({ where: { claimId }, select: { id: true } });
  for (const d of docs) await deleteDocument(d.id).catch(() => undefined);
  await prisma.billReview.deleteMany({ where: { claimId } }).catch(() => undefined);
  await prisma.claim.delete({ where: { id: claimId } }).catch(() => undefined);
}

/** Opens a claim from the bundled claim pack; the portal's previous claim goes. */
export async function runClaim(portalId: string): Promise<{ view: PortalClaimView; claimId: string }> {
  for (const d of await runs(portalId, "CLAIM_RUN")) {
    if (d.claimId) await removeClaim(d.claimId);
  }
  const { claim } = await createSampleClaim({ note: "Claim created from the fictional sample pack (partner demo portal)" });
  const view = await claimView(claim.id);
  if (!view) throw notFound("Claim");
  return { view, claimId: claim.id };
}
