import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma, WebhookEndpoint } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Webhooks: the platform posts what happened (a case opened, a guarantee sent,
// a claim settled, a call ended, a payment recorded, a partner's update) to the
// client's own systems. Every delivery is signed with the endpoint's secret
// (HMAC-SHA256 of the raw body) and logged with the response. Delivery never
// blocks or fails the action that caused it.
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS = [
  "case.created",
  "guarantee.sent",
  "claim.settled",
  "call.completed",
  "receivable.paid",
  "handoff.updated",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number] | "ping";

export const SIGNATURE_HEADER = "X-CareTrail-Signature";

export function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** For receivers: true when the signature header matches the body. */
export function verifySignature(secret: string, body: string, header: string | null): boolean {
  if (!header) return false;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const TIMEOUT_MS = 5000;

async function deliver(endpoint: WebhookEndpoint, event: WebhookEvent, data: unknown) {
  const id = `evt_${randomBytes(9).toString("hex")}`;
  const payload = { id, event, createdAt: new Date().toISOString(), data };
  const body = JSON.stringify(payload);
  const started = Date.now();
  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CareTrail-Event": event, "X-CareTrail-Delivery": id, [SIGNATURE_HEADER]: sign(endpoint.secret, body) },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    statusCode = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 300) : "delivery failed";
  }
  return prisma.webhookDelivery.create({
    data: {
      endpointId: endpoint.id,
      event,
      payload: payload as unknown as Prisma.InputJsonValue,
      statusCode,
      ok: error == null,
      error,
      durationMs: Date.now() - started,
    },
  });
}

/** Posts an event to every active endpoint that subscribed to it. Never throws. */
export async function emitEvent(event: WebhookEvent, data: unknown): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { active: true } });
    await Promise.all(endpoints.filter((e) => e.events.includes("*") || e.events.includes(event)).map((e) => deliver(e, event, data)));
  } catch (err) {
    console.error(`[webhooks] ${event} failed:`, err);
  }
}

/** Fire and forget, for actions that shouldn't wait on a client's server. */
export function emit(event: WebhookEvent, data: unknown): void {
  void emitEvent(event, data);
}

export async function createEndpoint(input: { url: string; events: string[]; description?: string | null }, by: string) {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw badRequest("Enter the full URL, e.g. https://example.com/hooks/caretrail.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw badRequest("Webhooks go to https:// URLs (http:// only for localhost).");
  }
  const events = input.events.filter((e) => e === "*" || (WEBHOOK_EVENTS as readonly string[]).includes(e));
  if (!events.length) throw badRequest("Pick at least one event.");
  return prisma.webhookEndpoint.create({
    data: { url: url.toString(), events, description: input.description ?? null, secret: `whsec_${randomBytes(24).toString("base64url")}`, createdBy: by },
  });
}

export async function deleteEndpoint(id: string) {
  const e = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!e) throw notFound("Webhook");
  await prisma.webhookEndpoint.delete({ where: { id } });
}

/** Sends a "ping" to one endpoint so its owner can check the signature. */
export async function pingEndpoint(id: string) {
  const e = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!e) throw notFound("Webhook");
  return deliver(e, "ping", { message: "Webhook test from the platform", endpoint: e.url });
}

export async function listEndpoints() {
  const endpoints = await prisma.webhookEndpoint.findMany({
    orderBy: { createdAt: "desc" },
    include: { deliveries: { orderBy: { createdAt: "desc" }, take: 8 } },
  });
  // The secret is shown masked; the owner sees it in full once, when it is created.
  return endpoints.map((e) => ({ ...e, secret: `${e.secret.slice(0, 10)}…${e.secret.slice(-4)}` }));
}
