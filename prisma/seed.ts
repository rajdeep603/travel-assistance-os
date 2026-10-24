import fs from "node:fs";
import path from "node:path";
import type { CaseEventType, Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { DEMO_DOCUMENTS } from "../scripts/demo-documents";
import { SAMPLE_DOCS } from "../scripts/samples/documents";
import { env } from "../src/lib/env";
import { maskPhone } from "../src/lib/format";
import { MATCH_THRESHOLD } from "../src/lib/intake/case-matching";
import { intakeSummary } from "../src/lib/intake/summary";
import { isUniqueViolation, syncRefSequences } from "../src/lib/refs";
import { familyUpdateText } from "../src/lib/family-update-text";
import { decideGuarantee } from "../src/lib/services/guarantee-decision";
import type { Benefit } from "../src/lib/services/policy";
import { addDays, formatPlainDate, utcToZoned, zonedToUtc, zonedToday } from "../src/lib/time";
import { getAgent } from "../src/lib/voice/agents/registry";
import {
  APPOINTMENTS,
  BILL_HISTORY,
  CASES,
  CLAIMS,
  GUARANTEE_LETTERS,
  KNOWLEDGE_DOCUMENTS,
  PATIENTS,
  PATIENT_POLICIES,
  POLICY_PLANS,
  PROVIDERS,
  PROVIDER_PROFILES,
  CASE_VENDORS,
  PARTNERS,
  RECEIVABLES,
  REGIONAL_CLAIMS,
  SEED_HANDOFFS,
  REGIONAL_LETTERS,
  seedCalls,
  seedInboundMessages,
  type SeedClock,
  type SeedWhen,
} from "./seed-data";

// ---------------------------------------------------------------------------
// Idempotent seed: every record is upserted on its unique ref/slug, so the
// seed can run repeatedly (locally, in CI and on every deployment) without
// duplicating data. Records without a ref are matched on a natural key.
// Nothing the app created is ever deleted. All data is fictional.
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** An Istanbul wall-clock slot `daysFromNow` days away, as a UTC instant. */
function slotAt(daysFromNow: number, time: string): Date {
  return zonedToUtc(zonedToday(daysFromNow), time);
}

/** A moment of the seeded history: Istanbul wall-clock `daysAgo` days back, or `minutesAgo`. */
function at(when: SeedWhen): Date {
  return "minutesAgo" in when ? new Date(Date.now() - when.minutesAgo * 60_000) : slotAt(-when.daysAgo, when.time);
}

const later = (d: Date, seconds: number) => new Date(d.getTime() + seconds * 1000);
const json = (value: unknown) => value as Prisma.InputJsonValue;

async function main() {
  // --if-empty: a database that already has demo data keeps it as it is, so
  // restarts and deploys don't reset what was changed during a demo (cases
  // worked, letters sent, …). Only patients, policies, providers, cases and
  // calls added to the demo since it was seeded are created.
  const addOnly = process.argv.includes("--if-empty") && (await prisma.patient.count()) > 0;
  const keep = <T>(data: T) => (addOnly ? {} : data);
  console.log(
    addOnly
      ? "Database already has demo data: adding only the demo records it lacks (AUTO_SEED=always re-seeds) …"
      : "Seeding fictional demo data …"
  );

  // --- Patients --------------------------------------------------------------
  const patientIds = new Map<string, string>();
  for (const p of PATIENTS) {
    const row = await prisma.patient.upsert({
      where: { ref: p.ref },
      create: { ...p, dateOfBirth: new Date(p.dateOfBirth) },
      update: keep({ ...p, dateOfBirth: new Date(p.dateOfBirth) }),
    });
    patientIds.set(p.ref, row.id);
  }
  console.log(`  patients: ${patientIds.size}`);

  // --- Policies (one per patient) -----------------------------------------------
  for (const pp of PATIENT_POLICIES) {
    const patient = PATIENTS.find((p) => p.ref === pp.patientRef)!;
    const plan = POLICY_PLANS[pp.plan];
    const currency = pp.currency ?? "EUR";
    const data = {
      plan: pp.plan,
      // A fixed start before every sample's treatment date, so date checks don't drift as the seed ages.
      validFrom: new Date("2026-08-01T00:00:00Z"),
      validTo: new Date(Math.max(Date.parse("2027-07-31T23:59:59Z"), daysAgo(-305).getTime())),
      currency,
      medicalLimit: plan.medicalLimit,
      medicalUsed: pp.medicalUsed,
      benefits: plan.benefits.map((b) => (b.unit ? { ...b, unit: b.unit.replace(/^EUR\b/, currency) } : b)),
    };
    await prisma.policy.upsert({
      where: { number: patient.policyNumber },
      create: { number: patient.policyNumber, ...data },
      update: keep(data),
    });
  }
  console.log(`  policies: ${PATIENT_POLICIES.length}`);

  // --- Providers ---------------------------------------------------------------
  const providerIds = new Map<string, string>();
  for (const p of PROVIDERS) {
    const profile = PROVIDER_PROFILES[p.ref] ?? {};
    const data = { ...p, ...profile, rateCard: profile.rateCard ? json(profile.rateCard) : undefined };
    const row = await prisma.provider.upsert({
      where: { ref: p.ref },
      create: data,
      update: keep(data),
    });
    // A deploy fills in kinds, accreditations and rates the record doesn't have yet, and changes nothing else.
    if (addOnly && (profile.kind || profile.accreditations || profile.rateCard) && row.kind === "CLINIC" && row.accreditations.length === 0 && row.rateCard == null) {
      await prisma.provider.update({
        where: { id: row.id },
        data: { kind: profile.kind, accreditations: profile.accreditations, rateCard: profile.rateCard ? json(profile.rateCard) : undefined },
      });
    }
    providerIds.set(p.ref, row.id);
  }
  console.log(`  providers: ${providerIds.size}`);

  // --- Cases -------------------------------------------------------------------
  const caseIds = new Map<string, string>();
  for (const c of CASES) {
    const { patientRef, daysAgo: ago, openedAt, ...rest } = c;
    const data = {
      ...rest,
      country: c.country ?? "Turkiye",
      patientId: patientIds.get(patientRef)!,
      createdAt: slotAt(-ago, openedAt),
    };
    const row = await prisma.case.upsert({
      where: { ref: c.ref },
      create: data,
      update: keep(data),
    });
    caseIds.set(c.ref, row.id);
  }
  console.log(`  cases: ${caseIds.size}`);
  await seedRegionalLetters(caseIds, providerIds, addOnly);
  await seedReceivables(addOnly);
  await seedNetwork(caseIds, addOnly);
  await seedTransportPlans(caseIds, addOnly);
  await seedFamilyUpdates(caseIds);
  if (addOnly) {
    await seedRegionalClaims({ patientIds, caseIds }, true);
    await seedCallHistory(SEED_CLOCK, caseIds, { onlyMissing: true });
    await syncRefSequences(prisma);
    console.log("Added the missing demo records; everything else is as it was.");
    return;
  }

  // --- Claims --------------------------------------------------------------------
  const claimIds = new Map<string, string>();
  for (const cl of CLAIMS) {
    const { patientRef, caseRef, daysAgo: ago, ...rest } = cl;
    const data = {
      ...rest,
      issues: cl.issues ?? undefined,
      patientId: patientIds.get(patientRef)!,
      caseId: caseRef ? caseIds.get(caseRef) : undefined,
      createdAt: daysAgo(ago),
      history: [
        { at: daysAgo(ago).toISOString(), action: "Claim submitted", note: null },
      ],
    };
    const row = await prisma.claim.upsert({
      where: { ref: cl.ref },
      create: data,
      update: data,
    });
    claimIds.set(cl.ref, row.id);
  }
  console.log(`  claims: ${CLAIMS.length}`);

  // --- Appointments -----------------------------------------------------------
  for (const a of APPOINTMENTS) {
    const { patientRef, providerRef, caseRef, daysFromNow, time, notes, ...rest } = a;
    const when = slotAt(daysFromNow, time);
    const data = {
      ...rest,
      notes: notes ?? null,
      scheduledAt: when,
      patientId: patientIds.get(patientRef)!,
      providerId: providerIds.get(providerRef)!,
      caseId: caseRef ? caseIds.get(caseRef) : undefined,
    };
    try {
      await prisma.appointment.upsert({
        where: { ref: a.ref },
        create: data,
        update: data,
      });
    } catch (err) {
      // Re-seeding a live database: a visitor may have booked this slot since.
      if (!isUniqueViolation(err)) throw err;
      console.warn(`  ! ${a.ref}: its slot is booked by a live appointment — left unchanged`);
    }
  }
  console.log(`  appointments: ${APPOINTMENTS.length}`);

  // --- Knowledge base ----------------------------------------------------------
  for (const k of KNOWLEDGE_DOCUMENTS) {
    await prisma.knowledgeDocument.upsert({
      where: { slug: k.slug },
      create: k,
      update: k,
    });
  }
  console.log(`  knowledge documents: ${KNOWLEDGE_DOCUMENTS.length}`);

  // --- Demo medical documents + real extractions -------------------------------
  // Runs the actual extraction pipeline (pdf-parse + demo AI provider) against
  // the generated fictional PDFs so seeded extractions match module output.
  const demoDocumentIds = await seedDemoDocuments(DEMO_DOCUMENTS, { patientIds, caseIds, claimIds });
  console.log(`  demo documents with extractions: ${demoDocumentIds.size}`);

  await seedRegionalClaims({ patientIds, caseIds }, false);
  await seedActivity({ patientIds, caseIds, claimIds, providerIds, demoDocumentIds });
  await seedBillHistory({ patientIds, caseIds });

  // Seeded refs are fixed; move the ref sequences past them.
  await syncRefSequences(prisma);

  console.log("Seed complete. All records are fictional demo data.");
}

// ---------------------------------------------------------------------------
// Activity history: inbound e-mails and faxes, Letters of Guarantee, calls and
// the case timeline entries they leave — shaped exactly as the app writes them.
// ---------------------------------------------------------------------------

interface SeedIds {
  patientIds: Map<string, string>;
  caseIds: Map<string, string>;
  claimIds: Map<string, string>;
  providerIds: Map<string, string>;
  /** Seeded demo documents by file name. */
  demoDocumentIds: Map<string, string>;
}

/**
 * Upserts a case timeline entry. Seeded entries are identified by case, type
 * and title — every title names a seeded ref or is unique to its case.
 */
async function timeline(
  caseId: string,
  e: { type: CaseEventType; title: string; body: string | null; actor: string; data?: unknown; at: Date }
): Promise<void> {
  const data = {
    caseId,
    type: e.type,
    title: e.title,
    body: e.body,
    actor: e.actor,
    data: e.data === undefined ? undefined : json(e.data),
    createdAt: e.at,
  };
  const existing = await prisma.caseEvent.findFirst({ where: { caseId, type: e.type, title: e.title }, select: { id: true } });
  if (existing) await prisma.caseEvent.update({ where: { id: existing.id }, data });
  else await prisma.caseEvent.create({ data });
}

/** Invoices reviewed in recent weeks: the history behind the overview's savings. */
async function seedBillHistory({ patientIds, caseIds }: Pick<SeedIds, "patientIds" | "caseIds">): Promise<void> {
  const { reviewBill } = await import("../src/lib/services/bill-review");
  const eur = (n: number) => `€${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  for (const b of BILL_HISTORY) {
    const kase = CASES.find((c) => c.ref === b.caseRef)!;
    const person = PATIENTS.find((p) => p.ref === kase.patientRef)!;
    const caseId = caseIds.get(b.caseRef)!;
    const patientId = patientIds.get(kase.patientRef)!;
    const lines = b.lines.map(([code, description, quantity, unitPrice]) => ({ code, description, quantity, unitPrice, amount: Math.round(quantity * unitPrice * 100) / 100 }));
    const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    const result = reviewBill({
      kind: "HOSPITAL_INVOICE",
      lines,
      total,
      currency: "EUR",
      diagnosis: b.diagnosis,
      admissionDate: b.admissionDate ?? null,
      dischargeDate: b.dischargeDate ?? null,
    });
    const when = daysAgo(b.daysAgo);
    const docData = {
      filename: b.filename,
      mimeType: "application/pdf",
      sizeBytes: 0,
      kind: "HOSPITAL_INVOICE" as const,
      status: "PROCESSED" as const,
      source: "EMAIL" as const,
      caseId,
      patientId,
      createdAt: when,
    };
    const existing = await prisma.document.findFirst({ where: { filename: b.filename, caseId }, select: { id: true } });
    const doc = existing ? await prisma.document.update({ where: { id: existing.id }, data: docData }) : await prisma.document.create({ data: docData });
    const extraction = {
      patientName: `${person.firstName} ${person.lastName}`,
      hospital: b.hospital,
      diagnosis: b.diagnosis,
      symptoms: [],
      procedures: [],
      medications: [],
      invoiceAmount: total,
      currency: "EUR",
      documentNumber: b.documentNumber,
      lineItems: json(lines),
      summary: `Itemised invoice ${b.documentNumber} from ${b.hospital}: ${eur(total)}.`,
      missingInfo: [],
      confidence: 0.92,
      aiSource: "offline",
    };
    await prisma.documentExtraction.upsert({ where: { documentId: doc.id }, create: { documentId: doc.id, ...extraction }, update: extraction });
    const decidedAt = b.status === "PROPOSED" ? null : later(when, 3 * 3600);
    const review = {
      caseId,
      kind: "HOSPITAL_INVOICE" as const,
      hospital: b.hospital,
      currency: "EUR",
      billed: result.billed,
      recommended: result.recommended,
      savings: result.savings,
      savingsEur: result.savingsEur,
      result: json({ ...result, guarantee: null }),
      ruleset: result.ruleset,
      inputHash: "seed",
      status: b.status,
      decidedBy: b.decidedBy ?? null,
      decidedAt,
      createdAt: when,
    };
    await prisma.billReview.upsert({ where: { documentId: doc.id }, create: { documentId: doc.id, ...review }, update: review });
    await timeline(caseId, {
      type: "BILL_REVIEW",
      title: `Bill review: ${eur(result.savings)} above the reference tariff on ${b.documentNumber}`,
      body: `Billed ${eur(result.billed)}, recommended ${eur(result.recommended)} (${result.findings.filter((f) => f.saving > 0).length} findings).`,
      actor: "agent:bill-review",
      at: later(when, 60),
    });
    if (decidedAt) {
      await timeline(caseId, {
        type: "BILL_REVIEW",
        title:
          b.status === "ACCEPTED"
            ? `Bill review accepted on ${b.documentNumber}: pay ${eur(result.recommended)}, saving ${eur(result.savings)}`
            : `Bill review waived on ${b.documentNumber}: pay as billed (${eur(result.billed)})`,
        body: null,
        actor: `operator:${b.decidedBy ?? "Claims Team"}`,
        at: decidedAt,
      });
    }
  }
  console.log(`  bill reviews: ${BILL_HISTORY.length}`);
}

const SEED_CLOCK: SeedClock = {
  date: (n) => zonedToday(n),
  spoken: (n) => formatPlainDate(zonedToday(n), { weekday: "long", day: "numeric", month: "long" }),
};

async function seedActivity({ patientIds, caseIds, claimIds, providerIds, demoDocumentIds }: SeedIds): Promise<void> {
  const clock = SEED_CLOCK;
  const patientOfCase = (caseRef: string) => patientIds.get(CASES.find((c) => c.ref === caseRef)!.patientRef)!;
  const messages = seedInboundMessages(clock);

  // --- Letters of Guarantee: decided by the app's own rules against the seeded policy ---
  const letters = await Promise.all(GUARANTEE_LETTERS.map(async (def) => {
    const message = messages.find((m) => m.ref === def.estimate.messageRef)!;
    const estimate = message.documents.find((d) => d.filename === def.estimate.filename)!.extraction;
    const createdAt = later(at(message.when), 20);
    const kase = await prisma.case.findUniqueOrThrow({
      where: { ref: def.caseRef },
      include: { patient: { include: { policy: true } } },
    });
    const policy = kase.patient.policy;
    const decision = decideGuarantee({
      country: kase.country,
      estimate: {
        amount: estimate.invoiceAmount!,
        currency: estimate.currency!,
        diagnosis: estimate.diagnosis,
        treatment: estimate.procedures,
        admissionDate: estimate.admissionDate,
      },
      policy: policy
        ? {
            number: policy.number,
            plan: policy.plan,
            validFrom: policy.validFrom,
            validTo: policy.validTo,
            currency: policy.currency,
            medicalLimit: Number(policy.medicalLimit),
            medicalUsed: Number(policy.medicalUsed),
            benefits: policy.benefits as unknown as Benefit[],
          }
        : null,
      autoApproveLimitEur: env.logAutoApproveLimitEur,
      on: createdAt,
    });
    return { def, estimate, decision, createdAt, provider: PROVIDERS.find((p) => p.ref === def.providerRef)! };
  }));
  const letterActions = (messageRef: string) =>
    letters
      .filter((l) => l.def.estimate.messageRef === messageRef)
      .map((l) => `Letter of Guarantee ${l.def.ref} ${l.decision.autoApprove ? "sent by fax" : "drafted for review"}`);

  // --- Inbound e-mails and faxes, their attachments and replies ---------------------
  const documentIds = new Map<string, string>();
  for (const m of messages) {
    const receivedAt = at(m.when);
    const best = m.candidates[0];
    const matched = best && best.score >= MATCH_THRESHOLD ? best : null;
    const caseId = matched ? caseIds.get(matched.caseRef)! : null;
    const patientId = matched ? patientOfCase(matched.caseRef) : null;
    const demoDocs = (m.demoDocuments ?? []).map((file) => DEMO_DOCUMENTS.find((d) => d.file === file)!);
    const filenames = [...m.documents.map((d) => d.filename), ...demoDocs.map((d) => d.file)];
    const kinds = [...m.documents.map((d) => d.kind), ...demoDocs.map((d) => d.kind)].map((k) => k.replace(/_/g, " ").toLowerCase());
    const summary = intakeSummary({
      channel: m.channel,
      from: m.fromAddress,
      caseRef: matched?.caseRef ?? null,
      kinds,
      claimRef: m.claimRef ?? null,
      language: m.language,
      actions: letterActions(m.ref),
    });

    const data = {
      channel: m.channel,
      fromAddress: m.fromAddress,
      toAddress: m.toAddress,
      subject: m.subject,
      bodyText: m.bodyText,
      receivedAt,
      status: m.status,
      language: m.language,
      riskFlags: m.riskFlags,
      summary,
      error: null,
      matchedCaseId: caseId,
      matchConfidence: best?.score ?? null,
      matchReasons: json(
        m.candidates.slice(0, 3).map((c) => ({
          caseId: caseIds.get(c.caseRef),
          caseRef: c.caseRef,
          patientId: patientOfCase(c.caseRef),
          score: c.score,
          reasons: c.reasons,
          ...(c.claimRef ? { claimId: claimIds.get(c.claimRef), claimRef: c.claimRef } : {}),
        }))
      ),
      createdAt: receivedAt,
    };
    const message = await prisma.inboundMessage.upsert({ where: { ref: m.ref }, create: { ref: m.ref, ...data }, update: data });

    for (const d of m.documents) {
      const docData = {
        filename: d.filename,
        mimeType: "application/pdf",
        sizeBytes: (d.ocr ? 160_000 : 24_000) + d.textContent.length * 16,
        kind: d.kind,
        status: "PROCESSED" as const,
        storagePath: null,
        textContent: d.textContent,
        language: d.language,
        translatedText: d.translatedText ?? null,
        ocr: d.ocr ?? false,
        source: m.channel,
        inboundMessageId: message.id,
        caseId,
        patientId,
        claimId: null,
        createdAt: receivedAt,
      };
      const existing = await prisma.document.findFirst({ where: { inboundMessageId: message.id, filename: d.filename }, select: { id: true } });
      const doc = existing
        ? await prisma.document.update({ where: { id: existing.id }, data: docData })
        : await prisma.document.create({ data: docData });
      const extraction = { ...d.extraction, symptoms: [], medications: [], dischargeDate: null };
      await prisma.documentExtraction.upsert({
        where: { documentId: doc.id },
        create: { documentId: doc.id, ...extraction },
        update: extraction,
      });
      documentIds.set(`${m.ref}/${d.filename}`, doc.id);
    }
    // Seeded demo documents that arrived as this message's attachments (skipped
    // when their PDFs weren't generated).
    const attached = demoDocs.map((d) => demoDocumentIds.get(d.file)).filter((id): id is string => Boolean(id));
    await prisma.document.updateMany({
      where: { id: { in: attached } },
      data: { inboundMessageId: message.id, source: m.channel },
    });

    if (m.reply) {
      const sentAt = later(receivedAt, m.reply.afterSec);
      const marker = `seed-${m.ref}`;
      const reply = {
        channel: "EMAIL" as const,
        toAddress: m.fromAddress,
        subject: `Re: ${m.subject ?? "your message"}`,
        body: m.reply.body,
        status: "SENT" as const,
        provider: "sendgrid",
        providerMessageId: marker,
        automatic: !m.reply.approvedBy,
        approvedBy: m.reply.approvedBy ?? null,
        caseId,
        inReplyToId: message.id,
        sentAt,
        createdAt: sentAt,
      };
      const existing = await prisma.outboundMessage.findFirst({ where: { providerMessageId: marker }, select: { id: true } });
      if (existing) await prisma.outboundMessage.update({ where: { id: existing.id }, data: reply });
      else await prisma.outboundMessage.create({ data: reply });
    }

    if (caseId) {
      await timeline(caseId, {
        type: m.channel,
        title: `${m.channel === "EMAIL" ? "E-mail" : "Fax"} ${m.ref} received${m.subject ? `: ${m.subject}` : ""}`,
        body: summary,
        data: { messageRef: m.ref, documents: filenames, riskFlags: m.riskFlags },
        actor: "agent:intake",
        at: later(receivedAt, 40),
      });
      if (m.reply?.approvedBy) {
        await timeline(caseId, {
          type: "EMAIL",
          title: `Reply to ${m.ref} sent`,
          body: m.reply.body.slice(0, 500),
          actor: `operator:${m.reply.approvedBy}`,
          at: later(receivedAt, m.reply.afterSec),
        });
      }
    }
  }
  console.log(`  inbound e-mails and faxes: ${messages.length}`);

  // --- Letters of Guarantee ------------------------------------------------------------
  // No PDF is generated here: pdfkit doesn't survive the seed bundle (seed.cjs),
  // so seeded letters carry no PDF. Drafts get theirs when a person approves them.
  for (const { def, estimate, decision, createdAt, provider } of letters) {
    const caseId = caseIds.get(def.caseRef)!;
    const auto = decision.autoApprove;
    const approvedBy = auto ? "system:auto-approval" : (def.approved?.by ?? null);
    // A letter the rules hold for a person stays a draft until someone approves it.
    const status = approvedBy ? def.status : "DRAFT";
    const approvedAt = !approvedBy ? null : auto || !def.approved ? later(createdAt, 1) : at(def.approved.when);
    const sentAt = approvedAt && status !== "DRAFT" ? later(approvedAt, auto ? 2 : 60) : null;
    const acknowledgedAt = status === "ACKNOWLEDGED" && def.acknowledged ? at(def.acknowledged.when) : null;
    const fax = provider.phone.replace(/[^\d+]/g, "");
    const money = (n: number) => `${n.toLocaleString("en-GB")} ${estimate.currency}`;

    const data = {
      caseId,
      providerId: providerIds.get(def.providerRef)!,
      hospitalName: provider.facility,
      estimateDocumentId: documentIds.get(`${def.estimate.messageRef}/${def.estimate.filename}`)!,
      estimatedAmount: estimate.invoiceAmount!,
      currency: estimate.currency!,
      guaranteedAmount: decision.guaranteedAmount,
      excess: decision.excess,
      conditions: decision.conditions,
      flags: decision.flags,
      validUntil: new Date(`${addDays(utcToZoned(createdAt).date, env.logValidDays)}T21:00:00Z`),
      status,
      approvedBy,
      rejectionReason: null,
      pdfDocumentId: null,
      sentVia: sentAt ? ("FAX" as const) : null,
      sentTo: sentAt ? fax : null,
      sentAt,
      acknowledgedAt,
      decisionTrace: json(decision.trace),
      createdAt,
    };
    await prisma.guaranteeLetter.upsert({ where: { ref: def.ref }, create: { ref: def.ref, ...data }, update: data });

    await timeline(caseId, {
      type: "LETTER_OF_GUARANTEE",
      title: `${def.ref} drafted from the cost estimate (${money(estimate.invoiceAmount!)})`,
      body: auto
        ? `Guarantee of ${money(decision.guaranteedAmount)} is within policy and the automatic approval limit.`
        : `Needs a human decision: ${decision.flags.join("; ")}.`,
      actor: "agent:guarantee",
      at: createdAt,
    });
    if (approvedBy && approvedAt) {
      const actor = auto ? approvedBy : `operator:${approvedBy}`;
      await timeline(caseId, {
        type: "LETTER_OF_GUARANTEE",
        title: `${def.ref} approved: ${money(decision.guaranteedAmount)}`,
        body: auto ? "Approved automatically: within policy and the automatic approval limit." : `Approved by ${approvedBy}.`,
        actor,
        at: approvedAt,
      });
      if (sentAt) {
        await timeline(caseId, {
          type: "LETTER_OF_GUARANTEE",
          title: `${def.ref} sent by fax to ${provider.facility}`,
          body: `Fax ${fax}`,
          actor,
          at: sentAt,
        });
      }
    }
    if (acknowledgedAt && def.acknowledged) {
      const by = def.acknowledged.by;
      await timeline(caseId, {
        type: "LETTER_OF_GUARANTEE",
        title: `${provider.facility} confirmed receipt of ${def.ref}`,
        body: def.acknowledged.note ?? null,
        actor: by.startsWith("system") || by.startsWith("agent:") ? by : `operator:${by}`,
        at: acknowledgedAt,
      });
    }
  }
  console.log(`  letters of guarantee: ${letters.length}`);

  await seedCallHistory(clock, caseIds);
}


/**
 * Files the fictional demo PDFs as processed documents, running the real
 * extraction pipeline (pdf-parse + the offline AI) so seeded extractions
 * match what the modules produce. Returns the document ids by file name.
 */
async function seedDemoDocuments(
  defs: typeof DEMO_DOCUMENTS,
  { patientIds, caseIds, claimIds }: { patientIds: Map<string, string>; caseIds: Map<string, string>; claimIds: Map<string, string> }
): Promise<Map<string, string>> {
  const { extractTextFromFile } = await import("../src/lib/services/pdf");
  const { MockAIService } = await import("../src/lib/services/ai/mock");
  const ai = new MockAIService();

  const demoDocumentIds = new Map<string, string>();
  for (const def of defs) {
    const filePath = path.join(process.cwd(), "public", "demo-documents", def.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ! demo PDF missing, skipping: ${def.file} (run npm run demo:pdfs)`);
      continue;
    }
    const buffer = fs.readFileSync(filePath);
    const text = await extractTextFromFile(buffer, "application/pdf");
    const result = await ai.extractMedicalDocument(text);

    const existing = await prisma.document.findFirst({
      where: { filename: def.file, storagePath: `demo-documents/${def.file}` },
    });
    const docData = {
      filename: def.file,
      mimeType: "application/pdf",
      sizeBytes: buffer.length,
      kind: def.kind,
      status: "PROCESSED" as const,
      storagePath: `demo-documents/${def.file}`,
      textContent: text.slice(0, 20000),
      patientId: patientIds.get(def.patientRef),
      caseId: def.caseRef ? caseIds.get(def.caseRef) : undefined,
      claimId: def.claimRef ? claimIds.get(def.claimRef) : undefined,
    };
    const doc = existing
      ? await prisma.document.update({ where: { id: existing.id }, data: docData })
      : await prisma.document.create({ data: docData });

    const e = result.extraction;
    const extractionData = {
      patientName: e.patientName,
      dateOfBirth: e.dateOfBirth,
      hospital: e.hospital,
      doctor: e.doctor,
      diagnosis: e.diagnosis,
      symptoms: e.symptoms,
      admissionDate: e.admissionDate,
      dischargeDate: e.dischargeDate,
      procedures: e.procedures,
      medications: e.medications,
      invoiceAmount: e.invoiceAmount,
      currency: e.currency,
      policyReference: e.policyReference,
      documentNumber: result.documentNumber ?? null,
      lineItems: result.lineItems?.length ? JSON.parse(JSON.stringify(result.lineItems)) : undefined,
      summary: result.summary,
      missingInfo: result.missingInfo,
      confidence: result.confidence,
      raw: JSON.parse(JSON.stringify(result)),
    };
    await prisma.documentExtraction.upsert({
      where: { documentId: doc.id },
      create: { documentId: doc.id, ...extractionData },
      update: extractionData,
    });
    demoDocumentIds.set(def.file, doc.id);
  }
  return demoDocumentIds;
}

/**
 * The regional claims, ready to settle: on a deploy (addOnly) the ones the
 * database lacks are created with their documents and bill review; existing
 * claims are left exactly as a demo left them.
 */
async function seedRegionalClaims(
  { patientIds, caseIds }: { patientIds: Map<string, string>; caseIds: Map<string, string> },
  addOnly: boolean
): Promise<void> {
  const claimIds = new Map<string, string>();
  for (const ref of REGIONAL_CLAIMS) {
    const def = CLAIMS.find((c) => c.ref === ref)!;
    const existing = await prisma.claim.findUnique({ where: { ref }, select: { id: true } });
    if (existing && addOnly) continue;
    const { patientRef, caseRef, daysAgo: ago, ...rest } = def;
    const data = {
      ...rest,
      issues: undefined,
      patientId: patientIds.get(patientRef)!,
      caseId: caseRef ? caseIds.get(caseRef) : undefined,
      createdAt: daysAgo(ago),
      history: [{ at: daysAgo(ago).toISOString(), action: "Claim submitted", note: null }],
    };
    const row = existing
      ? await prisma.claim.update({ where: { ref }, data })
      : await prisma.claim.create({ data });
    claimIds.set(ref, row.id);
  }
  if (claimIds.size === 0) return;
  try {
    const defs = DEMO_DOCUMENTS.filter((d) => d.claimRef && claimIds.has(d.claimRef));
    const ids = await seedDemoDocuments(defs, { patientIds, caseIds, claimIds });
    const { reviewBillForDocument } = await import("../src/lib/services/bill-review-service");
    const { checkCompleteness } = await import("../src/lib/services/claims");
    for (const def of defs.filter((d) => d.kind === "HOSPITAL_INVOICE")) await reviewBillForDocument(ids.get(def.file)!);
    for (const id of claimIds.values()) {
      const claim = await prisma.claim.findUniqueOrThrow({ where: { id }, include: { patient: true, documents: { include: { extraction: true } } } });
      await prisma.claim.update({ where: { id }, data: { issues: json(checkCompleteness(claim)) } });
    }
    console.log(`  regional claims with documents: ${claimIds.size}`);
  } catch (err) {
    // A deploy without the PDF tooling still gets the claims; their documents can be added in the app.
    console.warn(`  ! regional claim documents skipped: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * Network partners, which assistance company handles each case for the
 * insurer, and one case already handed to a partner. A deploy (addOnly)
 * creates what's missing and only fills in a case's vendor when it has none.
 */
async function seedNetwork(caseIds: Map<string, string>, addOnly: boolean): Promise<void> {
  const partnerIds = new Map<string, string>();
  for (const p of PARTNERS) {
    const data = { name: p.name, kind: p.kind, country: p.country, regions: p.regions, services: p.services, languages: p.languages, email: p.email, phone: p.phone, sla: p.sla ? json(p.sla) : undefined };
    const row = await prisma.networkPartner.upsert({ where: { ref: p.ref }, create: { ref: p.ref, ...data }, update: addOnly ? {} : data });
    partnerIds.set(p.ref, row.id);
  }
  for (const [caseRef, partnerRef] of Object.entries(CASE_VENDORS)) {
    const caseId = caseIds.get(caseRef);
    if (!caseId) continue;
    await prisma.case.updateMany({ where: { id: caseId, ...(addOnly ? { vendorId: null } : {}) }, data: { vendorId: partnerIds.get(partnerRef)! } });
  }
  for (const h of SEED_HANDOFFS) {
    if (addOnly && (await prisma.caseHandoff.findUnique({ where: { ref: h.ref }, select: { id: true } }))) continue;
    const caseId = caseIds.get(h.caseRef)!;
    const partner = PARTNERS.find((p) => p.ref === h.partnerRef)!;
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, include: { patient: { include: { policy: true } } } });
    const policy = kase.patient.policy;
    const sentAt = at({ daysAgo: h.sentDaysAgo, time: "09:40" });
    const minutes = (m: number) => new Date(sentAt.getTime() + m * 60_000);
    const last = h.updates[h.updates.length - 1];
    const pack = {
      caseRef: kase.ref,
      title: kase.title,
      summary: kase.aiSummary ?? kase.description,
      location: `${kase.location}, ${kase.country}`,
      priority: kase.priority,
      patient: { name: `${kase.patient.firstName} ${kase.patient.lastName}`, dateOfBirth: kase.patient.dateOfBirth.toISOString().slice(0, 10), nationality: kase.patient.nationality, language: kase.patient.language, phone: kase.patient.phone },
      policy: policy ? { number: policy.number, plan: policy.plan, currency: policy.currency, remaining: Number(policy.medicalLimit) - Number(policy.medicalUsed) } : null,
      guarantee: null,
      documents: [],
      instructions: [`Scope: ${h.scope}.`, "Accept or decline within two hours; post an update after every contact with the patient or the hospital."],
      contact: "Medical assistance desk, medical@demo-assistance.example",
    };
    const data = {
      caseId,
      partnerId: partnerIds.get(h.partnerRef)!,
      scope: h.scope,
      pack: json(pack),
      token: h.token,
      status: last?.status ?? "SENT",
      updates: json(h.updates.map((u) => ({ at: minutes(u.afterMinutes).toISOString(), by: `partner:${partner.name} (${u.by})`, status: u.status, note: u.note, eta: u.eta ?? null }))),
      sentBy: "sofia",
      respondBy: minutes(120),
      acceptedAt: h.updates.find((u) => u.status === "ACCEPTED") ? minutes(h.updates.find((u) => u.status === "ACCEPTED")!.afterMinutes) : null,
      createdAt: sentAt,
    };
    await prisma.caseHandoff.upsert({ where: { ref: h.ref }, create: { ref: h.ref, ...data }, update: data });
    await timeline(caseId, { type: "HANDOFF", title: `Handed to ${partner.name} (${h.ref}): ${h.scope}`, body: `Pack and secure link sent to ${partner.email}; answer due within 2 hours.`, actor: "operator:sofia", at: sentAt });
    for (const u of h.updates) {
      const verb = u.status === "ACCEPTED" ? "accepted" : u.status === "COMPLETED" ? "completed" : "posted an update on";
      await timeline(caseId, { type: "HANDOFF", title: `${partner.name} ${verb} ${h.ref}${u.status === "IN_PROGRESS" ? ` (${u.eta ?? "update"})` : ""}`, body: u.note, actor: `partner:${partner.name} (${u.by})`, at: minutes(u.afterMinutes) });
    }
  }
  console.log(`  network partners: ${PARTNERS.length}, hand-offs: ${SEED_HANDOFFS.length}`);
}

/**
 * A repatriation that needs an air ambulance, with quote requests out to the
 * network's operators (Geneva → Dubai), so the quote comparison can be shown
 * without the AI call first. Created when missing; a demo's booking is kept.
 */
/**
 * CASE-1024: Oliver Bennett's daughter called (CALL-0913, from her number), so
 * she gets the updates on WhatsApp: the case opened, the hospital's news, the
 * guarantee. Once a case has a family contact (seeded, or set in a demo) it is
 * left alone.
 */
async function seedFamilyUpdates(caseIds: Map<string, string>): Promise<void> {
  const caseId = caseIds.get("CASE-1024");
  if (!caseId) return;
  const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: { familyContactPhone: true, createdAt: true } });
  if (kase.familyContactPhone) return;
  // Timed from the case's own opening (18:49), so a server seeded days ago gets them in place.
  const after = (minutes: number) => new Date(kase.createdAt.getTime() + minutes * 60_000);
  const phone = "+447700900218";
  const contact = "Grace Bennett (daughter)";
  await prisma.case.update({
    where: { id: caseId },
    data: { familyContactName: "Grace Bennett", familyContactRelation: "Daughter", familyContactPhone: phone, familyContactLanguage: "English", familyUpdates: true },
  });
  const updates = [
    { at: after(3), automatic: true, text: familyUpdateText("opened", { ref: "CASE-1024", contactName: "Grace Bennett", patientFirstName: "Oliver", hospital: "Marmara Demo Heart Center" }) },
    { at: after(81), automatic: false, text: "Update on Oliver: he is in the coronary care unit (bed 4) at Marmara Demo Heart Center and stable on monitoring. The doctors expect his report tomorrow around noon. Case CASE-1024." },
    { at: after(96), automatic: true, text: familyUpdateText("guarantee", { ref: "CASE-1024", contactName: "Grace Bennett", patientFirstName: "Oliver", hospital: "Marmara Demo Heart Center", letterRef: "LOG-0903" }) },
  ];
  for (const [i, u] of updates.entries()) {
    const sentAt = u.at;
    await prisma.outboundMessage.create({
      data: {
        channel: "WHATSAPP",
        toAddress: phone,
        body: u.text,
        status: "SENT",
        provider: "mock",
        providerMessageId: `mock_wa_seed_family_${i + 1}`,
        automatic: u.automatic,
        approvedBy: u.automatic ? null : "Elif Demirtas (Case Manager)",
        caseId,
        sentAt,
        createdAt: sentAt,
      },
    });
    await prisma.caseEvent.create({
      data: { caseId, type: "WHATSAPP", title: `Update sent to ${contact} on WhatsApp`, body: u.text, actor: u.automatic ? "AI agent" : "Elif Demirtas (Case Manager)", createdAt: sentAt },
    });
  }
  console.log(`  family updates: ${updates.length} (CASE-1024)`);
}

async function seedTransportPlans(caseIds: Map<string, string>, addOnly: boolean): Promise<void> {
  const { recommendTransport, TRANSPORT_TARIFF_VERSION } = await import("../src/lib/services/transport");
  const ref = "MT-0901";
  if (addOnly && (await prisma.transportPlan.findUnique({ where: { ref }, select: { id: true } }))) return;
  const caseId = caseIds.get("CASE-1008");
  if (!caseId) return;
  const assessment = {
    diagnosis: "Tibial plateau fracture after surgery; deep vein thrombosis on day 4, on anticoagulation",
    fitToFly: true,
    fitFrom: "Tuesday",
    mobility: "STRETCHER" as const,
    oxygenLpm: 2,
    monitoring: "CONTINUOUS" as const,
    intensiveCare: false,
    escort: "DOCTOR" as const,
    destination: "Dubai",
    destinationCountry: "United Arab Emirates",
  };
  const rec = recommendTransport({ ...assessment, originCountry: "Switzerland" });
  const createdAt = at({ daysAgo: 1, time: "15:10" });
  const data = {
    caseId,
    callRef: null,
    assessment: json({ ...assessment, tariff: TRANSPORT_TARIFF_VERSION }),
    mode: rec.mode,
    reasons: rec.reasons,
    options: json({ distance: rec.distance, origin: rec.origin, options: rec.options, avoidedVsAirAmbulance: rec.avoidedVsAirAmbulance }),
    currency: rec.currency,
    estimateLow: rec.low,
    estimateHigh: rec.high,
    status: "QUOTES_REQUESTED" as const,
    quotes: undefined,
    mission: undefined,
    createdAt,
  };
  await prisma.transportPlan.upsert({ where: { ref }, create: { ref, ...data }, update: data });
  await timeline(caseId, {
    type: "TRANSPORT",
    title: `Medical transport ${ref}: ${rec.label.toLowerCase()} (indicative ${rec.low.toLocaleString("en-GB")}–${rec.high.toLocaleString("en-GB")} ${rec.currency})`,
    body: `${rec.reasons.join(" ")} Quote requests sent to the network's air ambulance operators.`,
    actor: "operator:arda",
    at: createdAt,
  });
  console.log(`  transport plans: 1 (${rec.mode.toLowerCase()})`);
}

/** A sample invoice's charge lines, as the invoice prints them. */
function sampleLines(file: string): { code: string; description: string; quantity: number; unitPrice: number; amount: number }[] {
  const doc = SAMPLE_DOCS.find((d) => d.file === file);
  const table = doc?.blocks.find((b) => b.type === "table");
  if (!table || table.type !== "table") throw new Error(`No charge table in ${file}`);
  const n = (v: string) => Number(v.replace(/,/g, ""));
  return table.rows.map(([code, description, q, unit, amount]) => ({ code, description, quantity: n(q), unitPrice: n(unit), amount: n(amount) }));
}

/**
 * Invoices the network's hospitals sent to foreign payers (the Receivables
 * page). A deploy (addOnly) creates the ones missing and leaves the rest as a
 * demo left them.
 */
async function seedReceivables(addOnly: boolean): Promise<void> {
  const day = 86_400_000;
  let created = 0;
  for (const r of RECEIVABLES) {
    if (addOnly && (await prisma.receivable.findUnique({ where: { ref: r.ref }, select: { id: true } }))) continue;
    const lines = r.linesFrom ? sampleLines(r.linesFrom) : null;
    const amount = lines ? Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100 : r.amount!;
    const sentAt = r.sentDaysAgo != null ? at({ daysAgo: r.sentDaysAgo, time: "10:15" }) : null;
    const paidAt = sentAt && r.paidAfterDays != null ? new Date(sentAt.getTime() + r.paidAfterDays * day) : null;
    const paidAmount = r.status === "PAID" ? amount : (r.paidAmount ?? 0);
    const chases = [
      ...(sentAt ? [{ at: sentAt.toISOString(), channel: "EMAIL", outcome: "Invoice sent", by: "billing" }] : []),
      ...(r.reminders ?? []).map((d) => ({ at: new Date(sentAt!.getTime() + d * day).toISOString(), channel: "EMAIL", outcome: "Reminder sent", by: "billing" })),
      ...(r.paidAmount && sentAt ? [{ at: new Date(sentAt.getTime() + 60 * day).toISOString(), channel: "EMAIL", outcome: `Payment received: ${r.paidAmount.toLocaleString("en-GB", { minimumFractionDigits: 2 })} ${r.currency}`, by: "billing" }] : []),
      ...(paidAt ? [{ at: paidAt.toISOString(), channel: "EMAIL", outcome: `Payment received: ${amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })} ${r.currency}`, by: "billing" }] : []),
    ];
    const data = {
      facility: r.facility,
      payerName: r.payer.name,
      payerEmail: r.payer.email,
      payerPhone: r.payer.phone,
      payerCountry: r.payer.country,
      patientName: r.patientName,
      dateOfBirth: r.dateOfBirth,
      policyNumber: r.policyNumber,
      gopRef: r.gop?.ref ?? null,
      gopAmount: r.gop?.amount ?? null,
      invoiceNumber: r.invoiceNumber,
      diagnosis: r.diagnosis,
      serviceFrom: r.serviceFrom,
      serviceTo: r.serviceTo,
      amount,
      currency: r.currency,
      paidAmount,
      lines: lines ? json(lines) : undefined,
      attachments: r.attachments,
      status: r.status,
      submittedAt: sentAt,
      dueAt: sentAt ? new Date(sentAt.getTime() + 30 * day) : null,
      paidAt,
      readiness: undefined,
      chases: json(chases),
      payerAnswer: r.payerAnswer ? json({ ...r.payerAnswer, at: new Date(Date.now() - 2 * day).toISOString() }) : undefined,
      createdAt: sentAt ?? at({ daysAgo: 1, time: "16:30" }),
    };
    await prisma.receivable.upsert({ where: { ref: r.ref }, create: { ref: r.ref, ...data }, update: data });
    created++;
  }
  console.log(`  receivables: ${created}`);
}

/**
 * The regional cases' guarantees, decided by the app's rules against the
 * seeded policy. A deploy (addOnly) creates the ones the database lacks and
 * leaves existing letters exactly as a demo left them.
 */
async function seedRegionalLetters(caseIds: Map<string, string>, providerIds: Map<string, string>, addOnly: boolean): Promise<void> {
  let created = 0;
  for (const def of REGIONAL_LETTERS) {
    if (addOnly && (await prisma.guaranteeLetter.findUnique({ where: { ref: def.ref }, select: { id: true } }))) continue;
    const caseId = caseIds.get(def.caseRef)!;
    const provider = PROVIDERS.find((p) => p.ref === def.providerRef)!;
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, include: { patient: { include: { policy: true } } } });
    const policy = kase.patient.policy;
    const createdAt = at(def.when);
    const decision = decideGuarantee({
      country: kase.country,
      estimate: { amount: def.estimate.amount, currency: def.estimate.currency, diagnosis: def.estimate.diagnosis, treatment: def.estimate.treatment, admissionDate: def.estimate.admissionDate },
      policy: policy
        ? {
            number: policy.number,
            plan: policy.plan,
            validFrom: policy.validFrom,
            validTo: policy.validTo,
            currency: policy.currency,
            medicalLimit: Number(policy.medicalLimit),
            medicalUsed: Number(policy.medicalUsed),
            benefits: policy.benefits as unknown as Benefit[],
          }
        : null,
      autoApproveLimitEur: env.logAutoApproveLimitEur,
      on: createdAt,
    });
    const approvedAt = later(createdAt, 1);
    const sentAt = later(createdAt, 2);
    const sentTo = def.sentVia === "EMAIL" ? provider.email : provider.phone.replace(/[^\d+]/g, "");
    const money = (n: number) => `${n.toLocaleString("en-GB")} ${def.estimate.currency}`;
    const data = {
      caseId,
      providerId: providerIds.get(def.providerRef)!,
      hospitalName: provider.facility,
      estimateDocumentId: null,
      estimatedAmount: def.estimate.amount,
      currency: def.estimate.currency,
      guaranteedAmount: decision.guaranteedAmount,
      excess: decision.excess,
      conditions: decision.conditions,
      flags: decision.flags,
      validUntil: new Date(`${addDays(utcToZoned(createdAt).date, env.logValidDays)}T21:00:00Z`),
      status: decision.autoApprove ? ("SENT" as const) : ("DRAFT" as const),
      approvedBy: decision.autoApprove ? "system:auto-approval" : null,
      rejectionReason: null,
      pdfDocumentId: null,
      sentVia: decision.autoApprove ? def.sentVia : null,
      sentTo: decision.autoApprove ? sentTo : null,
      sentAt: decision.autoApprove ? sentAt : null,
      acknowledgedAt: null,
      decisionTrace: json(decision.trace),
      createdAt,
    };
    await prisma.guaranteeLetter.upsert({ where: { ref: def.ref }, create: { ref: def.ref, ...data }, update: data });
    created++;
    await timeline(caseId, {
      type: "LETTER_OF_GUARANTEE",
      title: `${def.ref} drafted from the cost estimate (${money(def.estimate.amount)})`,
      body: decision.autoApprove ? `Guarantee of ${money(decision.guaranteedAmount)} is within policy and the automatic approval limit.` : `Needs a human decision: ${decision.flags.join("; ")}.`,
      actor: "agent:guarantee",
      at: createdAt,
    });
    if (decision.autoApprove) {
      await timeline(caseId, {
        type: "LETTER_OF_GUARANTEE",
        title: `${def.ref} sent by ${def.sentVia === "EMAIL" ? "e-mail" : "fax"} to ${provider.facility}`,
        body: def.sentVia === "EMAIL" ? `E-mail ${sentTo}` : `Fax ${sentTo}`,
        actor: "system:auto-approval",
        at: sentAt,
      });
    }
  }
  console.log(`  regional letters of guarantee: ${created}`);
}

/**
 * Calls (phone and browser) with their transcripts and timeline entries. With
 * onlyMissing, as on a deploy, calls already in the database are left exactly
 * as they are and only calls added to the demo since are created.
 */
async function seedCallHistory(clock: SeedClock, caseIds: Map<string, string>, opts: { onlyMissing?: boolean } = {}): Promise<void> {
  const calls = seedCalls(clock);
  const existingRefs = opts.onlyMissing
    ? new Set((await prisma.call.findMany({ where: { ref: { in: calls.map((c) => c.ref) } }, select: { ref: true } })).map((c) => c.ref))
    : new Set<string>();
  const added = calls.filter((c) => !existingRefs.has(c.ref));
  for (const c of added) {
    const profile = getAgent(c.agentProfile);
    if (!profile) throw new Error(`${c.ref}: unknown agent profile "${c.agentProfile}"`);
    const startedAt = at(c.when);
    const answeredAt = later(startedAt, c.ringSec);
    const endedAt = later(answeredAt, c.durationSec);
    const caseId = c.caseRef ? caseIds.get(c.caseRef)! : null;

    const transcript = c.transcript.map(([role, text], i) => ({
      role,
      text,
      at: later(answeredAt, Math.round(((i + 0.5) * c.durationSec) / c.transcript.length)).toISOString(),
    }));
    const conversation = {
      channel: c.channel === "PHONE" ? ("PHONE" as const) : ("VOICE" as const),
      messages: json(transcript),
      summary: c.summary,
      caseId,
      createdAt: startedAt,
    };
    const existing = await prisma.call.findUnique({ where: { ref: c.ref }, select: { conversationId: true } });
    const conversationId = existing?.conversationId
      ? (await prisma.conversation.update({ where: { id: existing.conversationId }, data: conversation })).id
      : (await prisma.conversation.create({ data: conversation })).id;

    const call = {
      direction: c.direction,
      channel: c.channel,
      agentProfile: c.agentProfile,
      status: c.status,
      fromNumber: c.fromNumber,
      toNumber: c.toNumber,
      language: c.language,
      startedAt,
      answeredAt,
      endedAt,
      durationSec: c.durationSec,
      outcome: json({ ...c.outcome, endReason: c.endReason }),
      summary: c.summary,
      transferredTo: c.transferredTo ?? null,
      placedBy: c.placedBy ?? null,
      conversationId,
      caseId,
      createdAt: startedAt,
    };
    await prisma.call.upsert({ where: { ref: c.ref }, create: { ref: c.ref, ...call }, update: call });

    if (!caseId) continue;
    if (c.direction === "OUTBOUND" && c.channel === "PHONE") {
      await timeline(caseId, {
        type: "CALL",
        title: `${profile.label} call ${c.ref} placed`,
        body: `Calling ${maskPhone(c.toNumber)}.`,
        actor: c.placedBy ? `operator:${c.placedBy}` : "system",
        at: startedAt,
      });
    }
    for (const { after, ...event } of c.events) {
      await timeline(caseId, { ...event, at: later(answeredAt, after) });
    }
    await timeline(caseId, {
      type: "CALL",
      title: `${c.channel === "PHONE" ? "Phone call" : "Voice session"} ${c.ref} — ${profile.label}`,
      body: c.summary,
      data: { callRef: c.ref, durationSec: c.durationSec, status: c.status, outcome: c.outcome },
      actor: `agent:${profile.id}`,
      at: endedAt,
    });
  }
  console.log(`  calls: ${opts.onlyMissing ? `${added.length} added` : calls.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
