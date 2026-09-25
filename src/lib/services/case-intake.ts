import type { Case, Patient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { nextCaseRef, nextPatientRef } from "@/lib/refs";
import { getAIService } from "./ai";
import { getNotificationService } from "./notification";
import type { CaseIntakeAnalysis } from "./types";

/**
 * CaseIntakeService: turns a free-text assistance request into an analysed,
 * ready-to-create case, and persists cases from an accepted analysis.
 */
export async function analyzeRequest(text: string): Promise<
  CaseIntakeAnalysis & { existingCase: { ref: string; status: string; id: string } | null }
> {
  const analysis = await getAIService().analyzeAssistanceRequest(text);
  let existingCase: { ref: string; status: string; id: string } | null = null;
  if (analysis.existingCaseRef) {
    const found = await prisma.case.findUnique({
      where: { ref: analysis.existingCaseRef },
      select: { id: true, ref: true, status: true },
    });
    if (found) existingCase = found;
  }
  return { ...analysis, existingCase };
}

export interface CreateCaseInput {
  requestText: string;
  analysis: CaseIntakeAnalysis;
  patientId?: string;
}

export async function createCaseFromAnalysis(
  input: CreateCaseInput
): Promise<Case & { patient: Patient }> {
  const { analysis } = input;

  let patientId = input.patientId;
  if (!patientId) {
    const patient = await findOrCreatePatient(analysis.patient);
    patientId = patient.id;
  }

  const created = await prisma.case.create({
    data: {
      ref: await nextCaseRef(),
      title: analysis.medicalIssue
        ? `${analysis.medicalIssue} — ${analysis.location ?? "location unknown"}`
        : `Assistance request — ${analysis.location ?? "location unknown"}`,
      description: input.requestText,
      location: analysis.location ?? "Unknown",
      country: analysis.country ?? "Unknown",
      assistanceType: analysis.assistanceType,
      priority: analysis.urgency,
      status: "NEW",
      urgency: analysis.urgency,
      symptoms: analysis.symptoms,
      aiSummary: analysis.summary,
      suggestedActions: analysis.suggestedActions,
      assignedTo: null,
      patientId,
    },
    include: { patient: true },
  });

  await getNotificationService().notify({
    kind: "CASE_CREATED",
    subject: `Case ${created.ref} created`,
    body: created.title,
  });

  return created;
}

/**
 * Demo helper: resolves the analysed patient description to a patient record.
 * Matches seeded patients by name where possible, otherwise registers a new
 * fictional patient shell for the case.
 */
async function findOrCreatePatient(name: string | null): Promise<Patient> {
  if (name && !/^the traveller|^traveller's/i.test(name)) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0];
    const last = parts.slice(1).join(" ") || null;
    const existing = await prisma.patient.findFirst({
      where: last
        ? {
            firstName: { equals: first, mode: "insensitive" },
            lastName: { equals: last, mode: "insensitive" },
          }
        : { firstName: { equals: first, mode: "insensitive" } },
    });
    if (existing) return existing;
  }
  return createDemoPatient(name);
}

export async function createDemoPatient(name: string | null): Promise<Patient> {
  const parts = (name && !/^the traveller|^traveller's/i.test(name)
    ? name
    : "Unregistered Traveller"
  )
    .trim()
    .split(/\s+/);
  const ref = await nextPatientRef();
  const n = Number(ref.split("-")[1]);
  return prisma.patient.create({
    data: {
      ref,
      firstName: parts[0],
      lastName: parts.slice(1).join(" ") || "(unknown)",
      dateOfBirth: new Date("1980-01-01"),
      nationality: "Unknown",
      language: "English",
      phone: "(not provided)",
      email: "(not provided)",
      policyNumber: `POL-TR-${100000 + n}`,
    },
  });
}
