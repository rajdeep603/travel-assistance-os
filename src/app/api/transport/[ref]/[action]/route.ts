import { NextResponse } from "next/server";
import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { advanceMission, bookQuote, receiveQuotes } from "@/lib/services/air-ambulance";
import { renderMedif } from "@/lib/services/medif-pdf";
import type { TransportAssessment, TransportModeCode } from "@/lib/services/transport";
import { zonedToday } from "@/lib/time";

export const dynamic = "force-dynamic";

async function plan(ref: string) {
  const p = await prisma.transportPlan.findFirst({ where: { OR: [{ id: ref }, { ref: ref.toUpperCase() }] } });
  if (!p) throw notFound("Transport plan");
  return p;
}

const bookSchema = z.object({ quoteId: z.string().min(1), reason: z.string().trim().max(500).optional() });

/** quotes: the operators' replies · book: book a quote · advance: the mission's next step. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { ref: string; action: string } }) => {
  const operator = (await getOperator(req)) ?? "operator";
  const p = await plan(params.ref);
  switch (params.action) {
    case "quotes":
      return json({ plan: serialize(await receiveQuotes(p.id)) });
    case "book": {
      const body = bookSchema.parse(await req.json().catch(() => ({})));
      return json({ plan: serialize(await bookQuote(p.id, body.quoteId, operator, body.reason)) });
    }
    case "advance":
      return json({ plan: serialize(await advanceMission(p.id, operator)) });
    default:
      throw notFound("Action");
  }
});

/** medif: the airline's medical information form, pre-filled from the doctor's assessment. */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { ref: string; action: string } }) => {
  if (params.action !== "medif") throw notFound("Action");
  const p = await plan(params.ref);
  const kase = await prisma.case.findUniqueOrThrow({ where: { id: p.caseId }, include: { patient: true, appointments: { include: { provider: true }, take: 1, orderBy: { scheduledAt: "desc" } } } });
  const a = p.assessment as unknown as TransportAssessment;
  const pdf = await renderMedif({
    planRef: p.ref,
    caseRef: kase.ref,
    issuedOn: zonedToday(),
    passenger: { name: `${kase.patient.firstName} ${kase.patient.lastName}`, dateOfBirth: kase.patient.dateOfBirth.toISOString().slice(0, 10), nationality: kase.patient.nationality },
    from: [kase.location, kase.country].filter(Boolean).join(", "),
    to: a.destination ?? a.destinationCountry ?? kase.patient.nationality,
    mode: p.mode as TransportModeCode,
    assessment: a,
    treatingPhysician: kase.appointments[0]?.provider.name ?? null,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="medif-${p.ref.toLowerCase()}.pdf"` },
  });
});
