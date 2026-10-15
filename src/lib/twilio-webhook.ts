import { NextResponse } from "next/server";
import { env } from "./env";
import { ApiError } from "./errors";
import { getTelephony } from "./services/telephony";

// ---------------------------------------------------------------------------
// Twilio webhook plumbing: every request is verified against its
// X-Twilio-Signature before anything happens. The signature covers the exact
// public URL Twilio called, so behind nginx it is rebuilt from PUBLIC_BASE_URL.
// ---------------------------------------------------------------------------

/** The URL as Twilio saw it (scheme/host from PUBLIC_BASE_URL or forwarded headers). */
export function publicRequestUrl(req: Request): string {
  const url = new URL(req.url);
  const base =
    env.publicBaseUrl ||
    `${req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host}`;
  return `${base}${url.pathname}${url.search}`;
}

/** Base URL for links Twilio must fetch (webhooks, media stream). */
export function publicBase(req: Request): string {
  const u = new URL(publicRequestUrl(req));
  return `${u.protocol}//${u.host}`;
}

/** Parses and authenticates a Twilio webhook; throws 503/403 otherwise. */
export async function readTwilioRequest(req: Request): Promise<Record<string, string>> {
  const telephony = getTelephony();
  if (!telephony.configured) {
    throw new ApiError("Telephony is not configured on this server.", 503, "TELEPHONY_NOT_CONFIGURED");
  }
  const form = await req.formData().catch(() => null);
  const params: Record<string, string> = {};
  form?.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  if (!telephony.validateSignature(req.headers.get("x-twilio-signature"), publicRequestUrl(req), params)) {
    throw new ApiError("Invalid Twilio signature.", 403, "FORBIDDEN");
  }
  return params;
}

export const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function twiml(body: string): Response {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/** Wraps a webhook so failures still answer Twilio with valid TwiML. */
export function withTwiml(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 503)) {
        return new NextResponse(err.message, { status: err.status });
      }
      console.error("[twilio] webhook failed:", err);
      return twiml(
        `<Say voice="Polly.Joanna">Sorry, our assistance line is having a technical problem. Please call again in a few minutes. In an emergency, call one one two.</Say><Hangup/>`
      );
    }
  };
}
