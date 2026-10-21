import { json, withErrorHandling } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { VisitorLeadSchema, createVisitorLead } from "@/lib/services/leads";

export const dynamic = "force-dynamic";

// A visitor's details from the booth's QR page (/meet). Public, so it takes
// only what the form asks for and a few submissions per address.

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const recent = new Map<string, number[]>();

function tooMany(ip: string): boolean {
  const now = Date.now();
  const times = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  times.push(now);
  recent.set(ip, times);
  if (recent.size > 5000) recent.clear();
  return times.length > MAX_PER_WINDOW;
}

export const POST = withErrorHandling(async (req: Request) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (tooMany(ip)) throw new ApiError("Too many submissions from this connection. Please try again in a few minutes.", 429, "RATE_LIMITED");
  const visitor = VisitorLeadSchema.parse(await req.json().catch(() => ({})));
  const { lead, existing } = await createVisitorLead(visitor);
  return json({ lead: { ref: lead.ref, customerName: lead.customerName, email: lead.email }, existing }, { status: existing ? 200 : 201 });
});
