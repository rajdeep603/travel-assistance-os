import { env } from "@/lib/env";

/** Where browsers open gateway sockets: configured (dev), else same origin under /ws (nginx). */
export function gatewayBase(req: Request): string {
  if (env.voiceGatewayPublicUrl) return env.voiceGatewayPublicUrl.replace(/\/$/, "");
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto === "https" ? "wss" : "ws"}://${host}`;
}
