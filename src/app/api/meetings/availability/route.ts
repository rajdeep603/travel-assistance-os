import { json, withErrorHandling } from "@/lib/api";
import { CallSlotSchema, callAvailability } from "@/lib/services/lead-meetings";

export const dynamic = "force-dynamic";

/** Free or busy in the organiser's calendar at a proposed time (?date=&time=&timeZone=&minutes=). */
export const GET = withErrorHandling(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const slot = CallSlotSchema.parse({ date: q.get("date"), time: q.get("time"), timeZone: q.get("timeZone"), minutes: Number(q.get("minutes")) });
  return json({ availability: await callAvailability(slot) });
});
