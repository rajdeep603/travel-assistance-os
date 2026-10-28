import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { badRequest } from "@/lib/errors";
import { MEETINGS_TEMPLATE, importMeetings } from "@/lib/services/meeting-import";

export const dynamic = "force-dynamic";

const MAX_CSV_BYTES = 1024 * 1024;

/** The CSV's text: a multipart upload (field "file") or the request body itself. */
async function csvText(req: Request): Promise<string> {
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const file = (await req.formData().catch(() => null))?.get("file");
    if (!(file instanceof File) || file.size === 0) throw badRequest("Choose the CSV file with your meetings.");
    if (file.size > MAX_CSV_BYTES) throw badRequest("The file is too large for a list of meetings (max 1 MB).");
    return file.text();
  }
  const text = await req.text();
  if (text.length > MAX_CSV_BYTES) throw badRequest("The file is too large for a list of meetings (max 1 MB).");
  if (!text.trim()) throw badRequest("Choose the CSV file with your meetings.");
  return text;
}

/** The template: the header row and one fictional example. */
export const GET = withErrorHandling(async () => {
  return new Response(MEETINGS_TEMPLATE, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="caretrail-meetings-template.csv"',
      "cache-control": "no-store",
    },
  });
});

/**
 * Imports booked meetings from a CSV (header row: customerName, companyName,
 * email, phone, role, segment, meetingAt, brief) as leads, matched by e-mail
 * address or else company and name. Any invalid row: nothing is imported, and
 * every problem comes back with its row number.
 */
export const POST = withErrorHandling(async (req: Request) => {
  const result = await importMeetings(await csvText(req), await getOperator(req));
  if (!result.ok) {
    return json(
      { error: { code: "INVALID_ROWS", message: "Nothing was imported. Fix these rows and import the file again.", rows: result.errors } },
      { status: 400 }
    );
  }
  return json({ created: result.created, updated: result.updated }, { status: result.created ? 201 : 200 });
});
