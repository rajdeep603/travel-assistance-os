import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { receiveSample } from "@/lib/intake/simulate";
import { EMAIL_SAMPLES, FAX_SAMPLES, WHATSAPP_SAMPLES } from "@/lib/intake/samples";

export const dynamic = "force-dynamic";

const Body = z.object({ kind: z.enum(["email", "fax", "whatsapp"]), sample: z.string() });

/** Feeds a bundled fictional e-mail, fax or WhatsApp message through the real intake pipeline. */
export const POST = withErrorHandling(async (req: Request) => {
  const { kind, sample } = Body.parse(await req.json().catch(() => ({})));
  const processed = await receiveSample(kind, sample);
  return json({ message: serialize(processed) }, { status: 201 });
});

/** The available samples (for the Inbox page). */
export const GET = withErrorHandling(async () => {
  return json({
    emails: EMAIL_SAMPLES.map((e) => ({ id: e.id, label: e.label })),
    faxes: FAX_SAMPLES.map((f) => ({ id: f.id, label: f.label })),
    whatsapps: WHATSAPP_SAMPLES.map((w) => ({ id: w.id, label: w.label })),
  });
});
