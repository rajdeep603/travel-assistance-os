import type { Appointment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { isUniqueViolation, withRef } from "@/lib/refs";
import { formatPlainDate, isPastSlot, isValidDate, isValidTime, zonedToUtc } from "@/lib/time";
import { getNotificationService } from "./notification";
import { slotsForDate } from "./provider-search";

/**
 * AppointmentService: books demo appointments against provider availability.
 * Dates and times are Istanbul wall-clock values; the instant is stored in UTC.
 * Double bookings are rejected by a partial unique index on the provider slot,
 * so two concurrent requests can never both succeed.
 */
export interface BookAppointmentInput {
  patientId: string;
  providerId: string;
  date: string; // YYYY-MM-DD (Istanbul)
  time: string; // HH:MM (Istanbul)
  reason: string;
  caseId?: string | null;
  source?: "WEB" | "VOICE" | "PHONE";
  notes?: string | null;
}

type Db = Prisma.TransactionClient | typeof prisma;

const SLOT_TAKEN = "That slot has just been taken. Please choose another time.";

export async function bookAppointment(
  input: BookAppointmentInput,
  db: Db = prisma
): Promise<Appointment> {
  if (!isValidDate(input.date) || !isValidTime(input.time)) {
    throw badRequest("Invalid appointment date or time.");
  }

  const provider = await db.provider.findUnique({ where: { id: input.providerId } });
  if (!provider) throw notFound("Provider");
  const patient = await db.patient.findUnique({ where: { id: input.patientId } });
  if (!patient) throw notFound("Patient");

  if (!slotsForDate(provider, input.date).includes(input.time)) {
    throw badRequest(
      `${provider.name} has no appointment slot at ${input.time} on ${formatPlainDate(input.date)}.`
    );
  }
  if (isPastSlot(input.date, input.time)) {
    throw badRequest("That slot is in the past. Please choose a later time.");
  }
  if (input.caseId) {
    const kase = await db.case.findUnique({
      where: { id: input.caseId },
      select: { patientId: true },
    });
    if (!kase) throw notFound("Case");
    if (kase.patientId !== input.patientId) {
      throw badRequest("That case belongs to a different patient.");
    }
  }

  let appointment: Appointment;
  try {
    appointment = await withRef("appointment", (ref) =>
      db.appointment.create({
        data: {
          ref,
          scheduledAt: zonedToUtc(input.date, input.time),
          status: "CONFIRMED",
          reason: input.reason,
          notes: input.notes ?? null,
          source: input.source ?? "WEB",
          patientId: input.patientId,
          providerId: input.providerId,
          caseId: input.caseId ?? null,
        },
      })
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(SLOT_TAKEN);
    throw err;
  }

  await getNotificationService().notify({
    kind: "APPOINTMENT_BOOKED",
    subject: `Appointment ${appointment.ref} confirmed`,
    body: `${patient.ref} → ${provider.name} (${provider.facility}) on ${formatPlainDate(input.date)} at ${input.time}.`,
  });

  return appointment;
}
