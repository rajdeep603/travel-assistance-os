import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { DEMO_DOCUMENTS } from "../scripts/demo-documents";
import {
  APPOINTMENTS,
  CASES,
  CLAIMS,
  KNOWLEDGE_DOCUMENTS,
  PATIENTS,
  PROVIDERS,
} from "./seed-data";

// ---------------------------------------------------------------------------
// Idempotent seed: every record is upserted on its unique ref/slug, so the
// seed can run repeatedly (locally, in CI and on every deployment) without
// duplicating data. All data is fictional.
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function atTime(date: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding fictional demo data …");

  // --- Patients --------------------------------------------------------------
  const patientIds = new Map<string, string>();
  for (const p of PATIENTS) {
    const row = await prisma.patient.upsert({
      where: { ref: p.ref },
      create: { ...p, dateOfBirth: new Date(p.dateOfBirth) },
      update: { ...p, dateOfBirth: new Date(p.dateOfBirth) },
    });
    patientIds.set(p.ref, row.id);
  }
  console.log(`  patients: ${PATIENTS.length}`);

  // --- Providers ---------------------------------------------------------------
  const providerIds = new Map<string, string>();
  for (const p of PROVIDERS) {
    const row = await prisma.provider.upsert({
      where: { ref: p.ref },
      create: p,
      update: p,
    });
    providerIds.set(p.ref, row.id);
  }
  console.log(`  providers: ${PROVIDERS.length}`);

  // --- Cases -------------------------------------------------------------------
  const caseIds = new Map<string, string>();
  for (const c of CASES) {
    const { patientRef, daysAgo: ago, ...rest } = c;
    const data = {
      ...rest,
      country: "Turkiye",
      patientId: patientIds.get(patientRef)!,
      createdAt: daysAgo(ago),
    };
    const row = await prisma.case.upsert({
      where: { ref: c.ref },
      create: data,
      update: data,
    });
    caseIds.set(c.ref, row.id);
  }
  console.log(`  cases: ${CASES.length}`);

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
    const { patientRef, providerRef, caseRef, daysFromNow, time, ...rest } = a;
    const when = atTime(daysAgo(-daysFromNow), time);
    const data = {
      ...rest,
      scheduledAt: when,
      patientId: patientIds.get(patientRef)!,
      providerId: providerIds.get(providerRef)!,
      caseId: caseRef ? caseIds.get(caseRef) : undefined,
    };
    await prisma.appointment.upsert({
      where: { ref: a.ref },
      create: data,
      update: data,
    });
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

  let docCount = 0;
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
    docCount++;
  }
  console.log(`  demo documents with extractions: ${docCount}`);

  console.log("Seed complete. All records are fictional demo data.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
