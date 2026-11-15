import { randomBytes } from "node:crypto";
import type { DemoPortal, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { signToken, verifyToken } from "@/lib/auth/tokens";

// ---------------------------------------------------------------------------
// Partner demo portals: a private link for one prospect, with fixed scenarios,
// a voice-minute budget, an expiry and a usage log. The token in the link
// opens the portal; a viewer then acknowledges confidentiality with an e-mail
// at the partner's domain, which sets a signed cookie for that portal. Voice
// sessions started from it are Calls placed by `portal:<id>`, so the budget
// is the sum of their durations.
// ---------------------------------------------------------------------------

export const PORTAL_PLACED_BY = (portalId: string) => `portal:${portalId}`;

/** The cookie that remembers a viewer's acknowledgement, one per portal. */
export const viewerCookieName = (portalId: string) => `pd_${portalId}`;

const LIVE_STATUSES = new Set(["QUEUED", "RINGING", "IN_PROGRESS"]);
/** A session that never connected stops counting as running after its cap plus this. */
const STALE_AFTER_SECONDS = 90;
/** A session whose browser never connected: the gateway ticket lasts a minute. */
const TICKET_GRACE_SECONDS = 90;
/** Below this many seconds left, no new session starts. */
export const MIN_SESSION_SECONDS = 45;

export type PortalState = "open" | "expired" | "revoked";

export function newPortalToken(): string {
  return randomBytes(18).toString("base64url");
}

export function portalState(p: Pick<DemoPortal, "expiresAt" | "revokedAt">, now = new Date()): PortalState {
  if (p.revokedAt) return "revoked";
  if (p.expiresAt <= now) return "expired";
  return "open";
}

/** The portal behind a link, or a 404 that says nothing about whether one exists. */
export async function portalByToken(token: string): Promise<DemoPortal> {
  const portal = token.length >= 16 && token.length <= 64 ? await prisma.demoPortal.findUnique({ where: { token } }) : null;
  if (!portal) throw new ApiError("This link is not valid.", 404, "NOT_FOUND");
  return portal;
}

/** The portal behind a link, only while it is open. */
export async function openPortal(token: string): Promise<DemoPortal> {
  const portal = await portalByToken(token);
  const state = portalState(portal);
  if (state === "revoked") throw new ApiError("This demo link has been withdrawn.", 410, "REVOKED");
  if (state === "expired") throw new ApiError("This demo link has expired.", 410, "EXPIRED");
  return portal;
}

const secret = () => {
  const s = process.env.SESSION_SECRET || process.env.GATEWAY_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new ApiError("The demo portal is not configured on this server.", 503, "NOT_CONFIGURED");
  return "dev-partner-demo-secret";
};

export interface Viewer {
  name: string;
  email: string;
  company: string;
}

/** Signs the viewer's acknowledgement until the portal expires. */
export async function viewerToken(portal: DemoPortal, viewer: Viewer): Promise<{ token: string; maxAge: number }> {
  const maxAge = Math.max(60, Math.floor((portal.expiresAt.getTime() - Date.now()) / 1000));
  const token = await signToken({ kind: "partner-demo-viewer", portalId: portal.id, ...viewer }, secret(), maxAge);
  return { token, maxAge };
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

/** The viewer who acknowledged this portal on this browser, if any. */
export async function viewerOf(req: Request, portal: DemoPortal): Promise<Viewer | null> {
  const raw = cookieValue(req.headers.get("cookie"), viewerCookieName(portal.id));
  const t = await verifyToken<{ kind: string; portalId: string; name: string; email: string; company: string }>(raw, secret());
  if (!t || t.kind !== "partner-demo-viewer" || t.portalId !== portal.id) return null;
  return { name: t.name, email: t.email, company: t.company };
}

/** An open portal and its acknowledged viewer; 403 until they have acknowledged. */
export async function requireViewer(req: Request, token: string): Promise<{ portal: DemoPortal; viewer: Viewer }> {
  const portal = await openPortal(token);
  const viewer = await viewerOf(req, portal);
  if (!viewer) throw new ApiError("Please confirm the confidentiality note first.", 403, "ACKNOWLEDGE_FIRST");
  return { portal, viewer };
}

export function cookieHeader(req: Request, name: string, value: string, maxAge: number): string {
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Whether an e-mail may open the portal: the invited contact, or anyone at the partner's domain. */
export function emailAllowed(portal: Pick<DemoPortal, "contactEmail" | "emailDomain">, email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  if (e === portal.contactEmail.trim().toLowerCase()) return true;
  const domain = portal.emailDomain?.trim().toLowerCase().replace(/^@/, "");
  return Boolean(domain) && (e.endsWith(`@${domain}`) || e.endsWith(`.${domain}`));
}

export interface PortalUsage {
  budgetSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  sessionSeconds: number;
  active: number;
  maxConcurrent: number;
  sessions: number;
}

/** Voice time used so far (ended sessions plus the running ones' elapsed time) and sessions running now. */
export async function portalUsage(portal: DemoPortal, now = Date.now()): Promise<PortalUsage> {
  const calls = await prisma.call.findMany({
    where: { placedBy: PORTAL_PLACED_BY(portal.id) },
    select: { status: true, durationSec: true, createdAt: true, answeredAt: true },
  });
  let used = 0;
  let active = 0;
  for (const c of calls) {
    if (c.durationSec != null) {
      used += c.durationSec;
      continue;
    }
    if (!LIVE_STATUSES.has(c.status)) continue;
    const age = (now - c.createdAt.getTime()) / 1000;
    // Never connected: its one-minute ticket has expired, so it can't start any more.
    if (!c.answeredAt && age > TICKET_GRACE_SECONDS) continue;
    if (age > portal.sessionSeconds + STALE_AFTER_SECONDS) continue;
    active += 1;
    if (c.answeredAt) used += Math.min(portal.sessionSeconds, Math.max(0, (now - c.answeredAt.getTime()) / 1000));
  }
  const budgetSeconds = portal.minuteBudget * 60;
  return {
    budgetSeconds,
    usedSeconds: Math.round(used),
    remainingSeconds: Math.max(0, Math.round(budgetSeconds - used)),
    sessionSeconds: portal.sessionSeconds,
    active,
    maxConcurrent: portal.maxConcurrent,
    sessions: calls.length,
  };
}

/** Records something a viewer did; never fails the request it belongs to. */
export async function logPortalEvent(portalId: string, type: string, viewer: string | null, detail?: Record<string, unknown>): Promise<void> {
  await prisma.demoPortalEvent
    .create({ data: { portalId, type, viewer, ...(detail ? { detail: detail as Prisma.InputJsonValue } : {}) } })
    .catch((err) => console.error(`[partner-demo] could not log ${type}:`, err));
}

/** Logs an event unless the same viewer logged the same one (same section) within `minutes`. */
export async function logPortalEventOnce(
  portalId: string,
  type: string,
  viewer: string | null,
  detail: Record<string, unknown> | undefined,
  minutes: number
): Promise<void> {
  const since = new Date(Date.now() - minutes * 60_000);
  const recent = await prisma.demoPortalEvent.findMany({ where: { portalId, type, viewer, createdAt: { gte: since } }, select: { detail: true }, take: 50 });
  const same = recent.some((e) => JSON.stringify(e.detail ?? null) === JSON.stringify(detail ?? null));
  if (!same) await logPortalEvent(portalId, type, viewer, detail);
}
