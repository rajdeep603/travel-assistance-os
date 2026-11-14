import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { sign, SIGNATURE_HEADER } from "@/lib/services/webhooks";

// ---------------------------------------------------------------------------
// A voice tool reading or writing the client's own CRM during a call (the
// MSH Americas POC: member records and cases in the client's system, not in
// CareTrail). The brief names the CRM's endpoint in "_crm_url", which the
// agent never sees. CareTrail only calls an origin the client registered as
// an active webhook endpoint, and signs each request with that endpoint's
// secret exactly like a webhook (HMAC-SHA256 of the raw body in
// X-CareTrail-Signature), so the client checks it with the code it already has.
//
// One JSON-RPC-style POST per step: { action, call_ref, at, ...args }.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 6000;

export class CrmUnavailable extends Error {}

/** The registered endpoint whose origin matches the CRM URL, or null. */
async function endpointFor(crmUrl: string) {
  let origin: string;
  try {
    const u = new URL(crmUrl);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) return null;
    origin = u.origin;
  } catch {
    return null;
  }
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { active: true }, select: { url: true, secret: true } });
  return endpoints.find((e) => {
    try {
      return new URL(e.url).origin === origin;
    } catch {
      return false;
    }
  }) ?? null;
}

/** Calls the CRM. Throws CrmUnavailable when it isn't configured, allowed or answering. */
export async function crmCall<T = Record<string, unknown>>(crmUrl: string | undefined, callRef: string, action: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!crmUrl) throw new CrmUnavailable("no CRM on this call");
  const endpoint = await endpointFor(crmUrl);
  if (!endpoint) throw new CrmUnavailable("the CRM's address isn't a registered webhook origin");
  const body = JSON.stringify({ id: `crm_${randomUUID()}`, action, call_ref: callRef, at: new Date().toISOString(), ...args });
  let res: Response;
  try {
    res = await fetch(crmUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CareTrail-Action": action, [SIGNATURE_HEADER]: sign(endpoint.secret, body) },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    throw new CrmUnavailable(err instanceof Error ? err.message.slice(0, 200) : "unreachable");
  }
  const data = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !data) throw new CrmUnavailable(`HTTP ${res.status}`);
  return data;
}
