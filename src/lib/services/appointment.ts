import type { Appointment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { nextAppointmentRef } from "@/lib/refs";
import { getNotificationService } from "./notification";

/**
 * AppointmentService: books demo appointments against provider availability.
 */
export interface BookAppointmentInput {
  patientId: string;
  providerId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  reason: string;
  caseId?: string | null;
  source?: "WEB" | "VOICE";
  notes?: string | null;
}

export async function bookAppointment(
  input: BookAppointmentInput
): Promise<Appointment> {
  const provider = await prisma.provider.findUnique({
    where: { id: input.providerId },
  });
  if (!provider) throw notFound("Provider");
  const patient = await prisma.patient.findUnique({
    where: { id: input.patientId },
  });
  if (!patient) throw notFound("Patient");

  const scheduledAt = new Date(`${input.date}T${input.time}:00`);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw badRequest("Invalid appointment date or time.");
  }

  const clash = await prisma.appointment.findFirst({
    where: {
      providerId: input.providerId,
      scheduledAt,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
  });
  if (clash) {
    throw badRequest(
      "That slot has just been taken. Please choose another time."
    );
  }

  const appointment = await prisma.appointment.create({
    data: {
      ref: await nextAppointmentRef(),
      scheduledAt,
      status: "CONFIRMED",
      reason: input.reason,
      notes: input.notes ?? null,
      source: input.source ?? "WEB",
      patientId: input.patientId,
      providerId: input.providerId,
      caseId: input.caseId ?? null,
    },
  });

  await getNotificationService().notify({
    kind: "APPOINTMENT_BOOKED",
    subject: `Appointment ${appointment.ref} confirmed`,
    body: `${patient.firstName} ${patient.lastName} → ${provider.name} (${provider.facility}) on ${input.date} at ${input.time}.`,
  });

  return appointment;
}
