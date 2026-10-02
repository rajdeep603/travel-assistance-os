import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { searchProviders } from "@/lib/services/provider-search";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  city: z.string().trim().max(60).optional(),
  district: z.string().trim().max(60).optional(),
  specialty: z.string().trim().max(60).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.")
    .optional(),
  timeOfDay: z.string().trim().max(20).optional(),
  language: z.string().trim().max(30).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

export const POST = withErrorHandling(async (req: Request) => {
  const body = bodySchema.parse(
    await req.json().catch(() => {
      throw badRequest("Expected a JSON search query.");
    })
  );
  const results = await searchProviders(body);
  return json({
    results: serialize(
      results.map((r) => ({
        provider: r.provider,
        distanceKm: r.distanceKm,
        slots: r.slots,
        reasons: r.reasons,
        score: r.score,
      }))
    ),
  });
});
