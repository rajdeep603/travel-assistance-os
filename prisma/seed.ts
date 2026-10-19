import fs from "node:fs";
import path from "node:path";
import type { CaseEventType, Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { DEMO_DOCUMENTS } from "../scripts/demo-documents";
import { env } from "../src/lib/env";
import { maskPhone } from "../src/lib/format";
import { MATCH_THRESHOLD } from "../src/lib/intake/case-matching";
import { intakeSummary } from "../src/lib/intake/summary";
import { isUniqueViolation, syncRefSequences } from "../src/lib/refs";
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
  // worked, letters sent, …). Only patients, policies, providers and cases
  // added to the demo since it was seeded are created.
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
    const row = await prisma.provider.upsert({
      where: { ref: p.ref },
      create: p,
      update: keep(p),
    });
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
  if (addOnly) {
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
  const { extractTextFromFile } = await import("../src/lib/services/pdf");
  const { MockAIService } = await import("../src/lib/services/ai/mock");
  const ai = new MockAIService();

  const demoDocumentIds = new Map<string, string>();
  for (const def of DEMO_DOCUMENTS) {
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
  console.log(`  demo documents with extractions: ${demoDocumentIds.size}`);

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

async function seedActivity({ patientIds, caseIds, claimIds, providerIds, demoDocumentIds }: SeedIds): Promise<void> {
  const clock: SeedClock = {
    date: (n) => zonedToday(n),
    spoken: (n) => formatPlainDate(zonedToday(n), { weekday: "long", day: "numeric", month: "long" }),
  };
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

  // --- Calls (phone and browser) with their transcripts -------------------------------
  const calls = seedCalls(clock);
  for (const c of calls) {
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
  console.log(`  calls: ${calls.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
