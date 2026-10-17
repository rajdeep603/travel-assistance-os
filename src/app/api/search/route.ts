import { json, withErrorHandling } from "@/lib/api";
import { globalSearch } from "@/lib/services/search";

export const dynamic = "force-dynamic";

/** Global search for the command palette: GET /api/search?q=lena */
export const GET = withErrorHandling(async (req: Request) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json({ hits: await globalSearch(q) });
});
