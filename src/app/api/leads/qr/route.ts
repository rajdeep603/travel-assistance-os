import QRCode from "qrcode";
import { withErrorHandling } from "@/lib/api";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Where visitors land when they scan the booth's code. */
function visitorPageUrl(req: Request): string {
  const origin = env.publicBaseUrl || `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("host") ?? "localhost:3000"}`;
  return `${origin}/meet?src=qr`;
}

/** The QR code for the visitor page, as an SVG the Leads page shows and prints. */
export const GET = withErrorHandling(async (req: Request) => {
  const url = visitorPageUrl(req);
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } });
  return new Response(svg, {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store", "x-visitor-url": url },
  });
});
