import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { bookAppointment } from "@/lib/services/appointment";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const appointments = await prisma.appointment.findMany({
    orderBy: { scheduledAt: "desc" },
    take: 50,
    include: { patient: true, provider: true, case: true },
  });
  return json({ appointments: serialize(appointments) });
});

const bodySchema = z.object({
  patientId: z.string().min(1),
  providerId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM."),
  reason: z.string().trim().min(3).max(300),
  caseId: z.string().optional(),
});

export const POST = withErrorHandling(async (req: Request) => {
  const body = bodySchema.parse(
    await req.json().catch(() => {
      throw badRequest("Expected a JSON appointment request.");
    })
  );
  const appointment = await bookAppointment({ ...body, source: "WEB" });
  return json({ appointment: serialize(appointment) }, { status: 201 });
});
