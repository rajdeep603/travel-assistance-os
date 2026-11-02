import QRCode from "qrcode";
import { withErrorHandling } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { priceLinkUrl } from "@/lib/services/provider-validation";

export const dynamic = "force-dynamic";

/** The QR code of a practice's price-list link, for a screen the practice can scan. */
export const GET = withErrorHandling(async (req: Request) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw badRequest("Missing link token.");
  const svg = await QRCode.toString(priceLinkUrl(token), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } });
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store" } });
});
