import type { Prisma, TransportPlan } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { sendEmail } from "./outbox";
import { MODE_LABELS, TRANSPORT_TARIFF_VERSION, recommendTransport, type TransportAssessment } from "./transport";

// ---------------------------------------------------------------------------
// Saves a medical transport plan on a case and, when the recommended mode
// needs a specialist provider, sends quote requests. The request carries the
// clinical facts a provider prices on, never the patient's name.
// ---------------------------------------------------------------------------

/** Fictional transport providers that quote for each mode. */
export const TRANSPORT_VENDORS: { name: string; email: string; modes: string[] }[] = [
  { name: "Demo Air Ambulance Europe", email: "quotes@demo-airambulance.example", modes: ["AIR_AMBULANCE", "COMMERCIAL_STRETCHER"] },
  { name: "Demo MedEscort", email: "ops@demo-medescort.example", modes: ["COMMERCIAL_ESCORTED", "COMMERCIAL_STRETCHER"] },
];

const initials = (first: string, last: string) => `${first[0] ?? ""}.${last[0] ?? ""}.`;

export async function createTransportPlan(
  caseId: string,
  assessment: TransportAssessment,
  opts: { callRef?: string | null; by: string }
): Promise<{ plan: TransportPlan; quotesFrom: string[] }> {
  const kase = await prisma.case.findUnique({ where: { id: caseId }, include: { patient: true } });
  if (!kase) throw notFound("Case");
  const destination = assessment.destinationCountry ?? kase.patient.nationality ?? null;
  const rec = recommendTransport({ ...assessment, destinationCountry: destination });
  const vendors = TRANSPORT_VENDORS.filter((v) => v.modes.includes(rec.mode));

  const plan = await withRef("transport", (ref) =>
    prisma.transportPlan.create({
      data: {
        ref,
        caseId,
        callRef: opts.callRef ?? null,
        assessment: { ...assessment, destinationCountry: destination, tariff: TRANSPORT_TARIFF_VERSION } as unknown as Prisma.InputJsonValue,
        mode: rec.mode,
        reasons: rec.reasons,
        options: { distance: rec.distance, options: rec.options, avoidedVsAirAmbulance: rec.avoidedVsAirAmbulance } as unknown as Prisma.InputJsonValue,
        currency: rec.currency,
        estimateLow: rec.low,
        estimateHigh: rec.high,
        status: vendors.length ? "QUOTES_REQUESTED" : "ASSESSED",
      },
    })
  );

  const age = Math.floor((Date.now() - kase.patient.dateOfBirth.getTime()) / (365.25 * 86_400_000));
  for (const v of vendors) {
    await sendEmail({
      to: `${v.name} <${v.email}>`,
      subject: `Quote request ${plan.ref}: ${MODE_LABELS[rec.mode].toLowerCase()}, Istanbul → ${assessment.destination ?? destination ?? "home"}`,
      text: [
        `Please quote for ${MODE_LABELS[rec.mode].toLowerCase()}, bed to bed.`,
        "",
        `Patient: ${initials(kase.patient.firstName, kase.patient.lastName)}, ${age} years`,
        `Diagnosis: ${assessment.diagnosis}`,
        `From: ${kase.location || "Istanbul"}, Türkiye`,
        `To: ${assessment.destination ?? destination ?? "to be confirmed"}`,
        `Fit to fly: ${assessment.fitToFly ? "yes" : `not yet${assessment.fitFrom ? ` (expected ${assessment.fitFrom})` : ""}`}`,
        `Mobility: ${assessment.mobility.toLowerCase()}; oxygen: ${assessment.oxygenLpm ? `${assessment.oxygenLpm} L/min` : "none"}; monitoring: ${assessment.monitoring.toLowerCase()}; escort: ${assessment.escort.toLowerCase()}`,
        assessment.notes ? `Notes: ${assessment.notes}` : null,
        "",
        `Reference ${plan.ref} / ${kase.ref}. Demonstration platform: all data is fictional.`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
      caseId,
      automatic: true,
      approvedBy: opts.by,
    });
  }

  await prisma.caseEvent.create({
    data: {
      caseId,
      type: "TRANSPORT",
      title: `Medical transport ${plan.ref}: ${rec.label.toLowerCase()}${rec.low ? ` (indicative ${rec.low.toLocaleString("en-GB")}–${rec.high.toLocaleString("en-GB")} EUR)` : ""}`,
      body: [
        ...rec.reasons,
        rec.avoidedVsAirAmbulance > 0 ? `About ${Math.round(rec.avoidedVsAirAmbulance).toLocaleString("en-GB")} EUR less than an air ambulance.` : null,
        vendors.length ? `Quote requests sent to ${vendors.map((v) => v.name).join(" and ")}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
      data: { ref: plan.ref, mode: rec.mode } as Prisma.InputJsonValue,
      actor: opts.by,
    },
  });
  if (rec.mode !== "NOT_FIT_TO_FLY") {
    await prisma.case.update({ where: { id: caseId }, data: { assistanceType: "REPATRIATION" } });
  }
  return { plan, quotesFrom: vendors.map((v) => v.name) };
}
