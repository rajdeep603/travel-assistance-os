import type { CasePriority, Patient, Prisma } from "@prisma/client";
import { nextRef } from "@/lib/refs";
import { countryOf, findCity } from "@/lib/services/nlu";
import type { ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Record helpers shared by voice tools. They run inside the caller's
// transaction so a booking, its case and a new patient commit together or
// not at all.
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

function splitName(name: string | null | undefined): { first: string; last: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Unregistered", last: "Traveller" };
  return { first: parts[0], last: parts.slice(1).join(" ") || "(unknown)" };
}

/**
 * The patient a call is about: the call's linked patient, a policy-number
 * match, or a new record. Never matched by name alone — two travellers can
 * share a name, and attaching a caller to the wrong record is worse than a
 * duplicate a case manager can merge.
 */
export async function resolvePatient(
  tx: Tx,
  ctx: Pick<ToolContext, "patientId">,
  input: { name?: string | null; contact?: string | null; policyNumber?: string | null; language?: string | null }
): Promise<Patient> {
  if (ctx.patientId) {
    const linked = await tx.patient.findUnique({ where: { id: ctx.patientId } });
    if (linked) return linked;
  }
  if (input.policyNumber) {
    const byPolicy = await tx.patient.findUnique({
      where: { policyNumber: input.policyNumber.trim().toUpperCase() },
    });
    if (byPolicy) return byPolicy;
  }
  const { first, last } = splitName(input.name);
  const contact = input.contact?.trim() ?? "";
  const ref = await nextRef("patient", tx);
  return tx.patient.create({
    data: {
      ref,
      firstName: first,
      lastName: last,
      dateOfBirth: new Date("1980-01-01"),
      nationality: "Unknown",
      language: input.language ?? "English",
      phone: /\d{6,}/.test(contact.replace(/\D/g, "")) && !contact.includes("@") ? contact : "(not provided)",
      email: contact.includes("@") ? contact : "(not provided)",
      policyNumber: `POL-TR-${100000 + Number(ref.split("-")[1])}`,
    },
  });
}

export interface NewCaseInput {
  title: string;
  description: string;
  location: string;
  symptoms?: string[];
  priority?: CasePriority;
  assistanceType?: "MEDICAL" | "DENTAL" | "HOSPITALIZATION" | "EVACUATION" | "REPATRIATION" | "GENERAL";
  summary?: string | null;
}

export async function createCaseRecord(tx: Tx, patientId: string, input: NewCaseInput, actor: string) {
  const ref = await nextRef("case", tx);
  const kase = await tx.case.create({
    data: {
      ref,
      title: input.title.slice(0, 200),
      description: input.description,
      location: input.location,
      country: countryOf(findCity(input.location)) ?? "Turkiye",
      assistanceType: input.assistanceType ?? "MEDICAL",
      priority: input.priority ?? "MEDIUM",
      urgency: input.priority ?? "MEDIUM",
      status: "IN_PROGRESS",
      symptoms: input.symptoms ?? [],
      aiSummary: input.summary ?? null,
      patientId,
    },
  });
  await tx.caseEvent.create({
    data: {
      caseId: kase.id,
      type: "NOTE",
      title: "Case opened by the voice agent",
      body: input.summary ?? input.description,
      actor,
    },
  });
  return kase;
}

export const agentActor = (ctx: Pick<ToolContext, "profileId">) => `agent:${ctx.profileId}`;
