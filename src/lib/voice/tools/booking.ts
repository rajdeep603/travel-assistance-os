import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { bookAppointment } from "@/lib/services/appointment";
import { LANGUAGES, SPECIALTIES, findCity, findDistrict, parseDateExpression, parseTimeExpression } from "@/lib/services/nlu";
import { searchProviders } from "@/lib/services/provider-search";
import { daysFromToday, formatPlainDate, isValidDate, zonedToday } from "@/lib/time";
import { agentActor, createCaseRecord, resolvePatient } from "./records";
import { defineTool, type ToolContext } from "./types";

/** "Kadıköy" → "kadikoy": Turkish dotless ı survives NFKD, so fold it first. */
const fold = (s: string) => s.replace(/ı/g, "i").replace(/İ/g, "I");

function resolveLocation(text: string): { city: string; district: string | null; label: string } {
  const district = findDistrict(fold(text));
  const city = findCity(fold(text)) ?? "Istanbul";
  return { city, district, label: district ? `${district}, ${city}` : city };
}

function resolveDate(text: string | undefined): string {
  if (text && isValidDate(text)) return text;
  return (text && parseDateExpression(text)) || zonedToday(1);
}

/** How a person would say the date: "today", "tomorrow", "Friday 16 October". */
export function spokenDate(date: string): string {
  const diff = daysFromToday(date);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return formatPlainDate(date, { weekday: "long", day: "numeric", month: "long" });
}

export const searchProvidersTool = defineTool({
  name: "search_providers",
  description:
    "Search the provider network for available appointments. Call once you know where the traveller is and roughly what they need. Returns up to 3 options with free time slots; present them to the caller and let them choose.",
  schema: z.object({
    location: z.string().describe("Where the traveller is, e.g. 'Taksim' or 'Kadikoy, Istanbul'"),
    specialty: z.enum(SPECIALTIES as [string, ...string[]]).optional().describe("Best-fitting specialty; General Medicine when unsure"),
    date: z.string().optional().describe("YYYY-MM-DD, or 'today' / 'tomorrow' / a weekday. Defaults to tomorrow."),
    time_of_day: z.string().optional().describe("'morning', 'afternoon', 'evening' or HH:MM"),
    language: z.enum(LANGUAGES as [string, ...string[]]).optional().describe("Language the doctor should speak"),
  }),
  async execute(args, ctx) {
    const where = resolveLocation(args.location);
    const date = resolveDate(args.date);
    const timeOfDay = args.time_of_day ? parseTimeExpression(args.time_of_day) ?? undefined : undefined;
    const query = {
      city: where.city,
      district: where.district ?? undefined,
      specialty: args.specialty,
      date,
      timeOfDay,
      language: args.language,
      limit: 3,
    };
    let results = await searchProviders(query);
    let note: string | undefined;
    if (results.length === 0 && args.language) {
      results = await searchProviders({ ...query, language: undefined });
      if (results.length) note = `No ${args.language}-speaking doctor is free then; these speak other languages.`;
    }
    const options = results
      .filter((r) => r.slots.length > 0)
      .map((r, i) => ({
        option: i + 1,
        provider_id: r.provider.id,
        doctor: r.provider.name,
        facility: r.provider.facility,
        specialty: r.provider.specialty,
        district: r.provider.district,
        distance_km: r.distanceKm,
        languages: r.provider.languages,
        slots: r.slots.slice(0, 3).map((s) => s.time),
        why: r.reasons.slice(0, 3),
      }));

    ctx.emit({
      type: "providers",
      date,
      location: where.label,
      options: options.map((o) => ({ ...o, date })),
    });
    if (options.length === 0) {
      // A city outside the demo network: another day won't help.
      const covered = await prisma.provider.count({ where: { city: { equals: where.city, mode: "insensitive" } } });
      return {
        date,
        date_spoken: spokenDate(date),
        options: [],
        advice: covered
          ? "Nothing is free then. Offer another day or time of day and search again."
          : `There are no doctors in ${where.city} in this demonstration network. Don't search again: open a case and tell the caller a case manager will find a doctor there and call them back.`,
      };
    }
    return { date, date_spoken: spokenDate(date), location: where.label, options, ...(note ? { note } : {}) };
  },
});

const bookingSchema = z.object({
  provider_id: z.string().describe("provider_id from search_providers"),
  date: z.string().describe("YYYY-MM-DD from search_providers"),
  time: z.string().describe("HH:MM, one of the option's slots"),
  patient_name: z.string().describe("The patient's full name"),
  contact: z.string().optional().describe("Phone number or e-mail the caller gave"),
  policy_number: z.string().optional().describe("Insurance policy number, if the caller gave one"),
  reason: z.string().describe("Short reason for the visit, e.g. 'severe stomach pain'"),
  caller_confirmed: z.boolean().describe("true only if the caller explicitly confirmed this exact booking"),
});

/**
 * Slots already booked on each call. Grok can send the same booking twice in
 * one turn (parallel function calls); the repeat gets the first result rather
 * than a "slot taken" error about the appointment the caller just got.
 */
const bookingsByCall = new WeakMap<ToolContext, Map<string, Promise<Record<string, unknown>>>>();

export const bookAppointmentTool = defineTool({
  name: "book_appointment",
  description:
    "Book a slot from search_providers. Only call after reading back provider, date, time and location and hearing the caller say yes. Creates the appointment, the patient record if needed, and the assistance case. Returns the appointment and case references.",
  schema: bookingSchema,
  async execute(args, ctx) {
    if (!args.caller_confirmed) {
      return {
        error:
          "Not booked. Read back the provider, date, time and location, and ask the caller to confirm before booking.",
      };
    }
    const key = `${args.provider_id}|${args.date}|${args.time}`;
    const booked = bookingsByCall.get(ctx) ?? new Map<string, Promise<Record<string, unknown>>>();
    bookingsByCall.set(ctx, booked);
    const earlier = booked.get(key);
    if (earlier) {
      const result = await earlier;
      return result.booked ? { ...result, note: "Already booked on this call; it is one appointment." } : result;
    }
    const attempt = bookSlot(args, ctx);
    booked.set(key, attempt);
    const result = await attempt.catch((err) => {
      booked.delete(key);
      throw err;
    });
    if (!result.booked) booked.delete(key); // failures may be retried
    return result;
  },
});

async function bookSlot(args: z.infer<typeof bookingSchema>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const provider = await prisma.provider.findUnique({ where: { id: args.provider_id } });
  if (!provider) return { error: "Unknown provider_id. Use an option from search_providers." };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const patient = await resolvePatient(tx, ctx, {
        name: args.patient_name,
        contact: args.contact,
        policyNumber: args.policy_number,
      });
      let caseId = ctx.caseId;
      let caseRef: string;
      if (caseId) {
        const existing = await tx.case.findUniqueOrThrow({ where: { id: caseId }, select: { ref: true } });
        caseRef = existing.ref;
      } else {
        const kase = await createCaseRecord(
          tx,
          patient.id,
          {
            title: `${args.reason} — ${provider.district}`,
            description: `Voice-assisted intake (${ctx.callRef}): ${args.reason}.`,
            location: `${provider.district}, ${provider.city}`,
            summary: `${patient.firstName} ${patient.lastName} asked for help with ${args.reason}; appointment booked by the voice agent.`,
          },
          agentActor(ctx)
        );
        caseId = kase.id;
        caseRef = kase.ref;
      }
      const appointment = await bookAppointment(
        {
          patientId: patient.id,
          providerId: provider.id,
          date: args.date,
          time: args.time,
          reason: args.reason,
          caseId,
          source: ctx.channel === "PHONE" ? "PHONE" : "VOICE",
          notes: `Booked by the voice agent on ${ctx.callRef}.`,
        },
        tx
      );
      await tx.caseEvent.create({
        data: {
          caseId,
          type: "APPOINTMENT",
          title: `Appointment ${appointment.ref} booked`,
          body: `${provider.name}, ${provider.facility} (${provider.district}) — ${formatPlainDate(args.date)} at ${args.time}`,
          data: { appointmentRef: appointment.ref, callRef: ctx.callRef },
          actor: agentActor(ctx),
        },
      });
      return { patient, caseId, caseRef, appointment };
    });

    await ctx.setCase(result.caseId, result.patient.id);
    await ctx.setOutcome({
      appointmentRef: result.appointment.ref,
      caseRef: result.caseRef,
      // What was booked, so the call summary can say it in words.
      appointment: { date: args.date, time: args.time, specialty: provider.specialty, doctor: provider.name, reason: args.reason },
    });
    ctx.emit({
      type: "booked",
      appointment: {
        ref: result.appointment.ref,
        date: args.date,
        time: args.time,
        doctor: provider.name,
        facility: provider.facility,
        district: provider.district,
        address: provider.address,
        phone: provider.phone,
        specialty: provider.specialty,
      },
      case: { id: result.caseId, ref: result.caseRef },
      patient: {
        ref: result.patient.ref,
        name: `${result.patient.firstName} ${result.patient.lastName}`,
      },
    });
    return {
      booked: true,
      appointment_ref: result.appointment.ref,
      case_ref: result.caseRef,
      when: `${spokenDate(args.date)} at ${args.time}`,
      where: `${provider.facility}, ${provider.address}, ${provider.district}`,
      doctor: provider.name,
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { error: "That slot was just taken. Search again and offer the caller other times.", slot_taken: true };
    }
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
}
