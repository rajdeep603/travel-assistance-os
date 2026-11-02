import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { findCare } from "@/lib/services/find-care";
import { CARE_LOCATIONS, resolveLocation } from "@/lib/services/provider-needs";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** A listed place or district, by id or label; or free text naming an Istanbul district. */
  location: z.string().trim().max(120).optional(),
  /** Exact coordinates, when the caller has them. */
  at: z.object({ lat: z.number(), lng: z.number(), label: z.string().max(120).optional() }).optional(),
  /** Start from where the case's patient is. */
  caseId: z.string().optional(),
  need: z.string().max(30),
  openNow: z.boolean().optional(),
  directBilling: z.boolean().optional(),
  language: z.string().trim().max(30).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeOfDay: z.string().trim().max(20).optional(),
});

/** Care near a patient: the need, where they are, the filters; providers within 2 km first, widening until there is a choice. */
export const POST = withErrorHandling(async (req: Request) => {
  const body = Body.parse(
    await req.json().catch(() => {
      throw badRequest("Expected a JSON search.");
    })
  );
  let at: { lat: number; lng: number; label: string } | null = body.at ? { lat: body.at.lat, lng: body.at.lng, label: body.at.label ?? "the patient's location" } : null;
  if (!at && body.location) {
    const loc = resolveLocation(body.location);
    if (loc) at = { lat: loc.lat, lng: loc.lng, label: loc.label };
  }
  if (!at && body.caseId) {
    const kase = await prisma.case.findUnique({ where: { id: body.caseId }, select: { location: true } });
    const loc = resolveLocation(kase?.location ?? null);
    if (loc) at = { lat: loc.lat, lng: loc.lng, label: `${loc.label} (from the case)` };
  }
  if (!at) {
    if (body.location) throw badRequest(`"${body.location}" isn't a place the demo knows. Pick a district, hotel or airport from the list.`);
    const fallback = CARE_LOCATIONS[0];
    at = { lat: fallback.lat, lng: fallback.lng, label: fallback.label };
  }
  const result = await findCare({ at, label: at.label, need: body.need, openNow: body.openNow, directBilling: body.directBilling, language: body.language || null, date: body.date, timeOfDay: body.timeOfDay });
  return json(serialize(result));
});
