import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { logPortalEvent, portalState, portalUsage } from "@/lib/partner-demo/portal";
import { portalCalls } from "@/lib/partner-demo/views";

export const dynamic = "force-dynamic";

/** A portal's usage log: who acknowledged, what they opened, every session. */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  const portal = await prisma.demoPortal.findUnique({ where: { id: params.id }, include: { events: { orderBy: { createdAt: "desc" }, take: 300 } } });
  if (!portal) throw notFound("Demo portal");
  return json({
    portal: { id: portal.id, company: portal.company, state: portalState(portal), expiresAt: portal.expiresAt.toISOString() },
    usage: await portalUsage(portal),
    events: portal.events.map((e) => ({ id: e.id, type: e.type, viewer: e.viewer, detail: e.detail, at: e.createdAt.toISOString() })),
    calls: await portalCalls(portal),
  });
});

const Body = z.object({
  action: z.enum(["revoke", "restore", "update"]),
  expiresAt: z.string().min(10).max(40).optional(),
  minuteBudget: z.number().int().min(5).max(600).optional(),
  hostContact: z.string().trim().max(200).optional(),
});

/** Withdraw a link, give it back, or change its expiry, voice budget or contact line. */
export const PATCH = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  const portal = await prisma.demoPortal.findUnique({ where: { id: params.id } });
  if (!portal) throw notFound("Demo portal");
  const by = await getOperator(req);
  if (body.action === "revoke") {
    await prisma.demoPortal.update({ where: { id: portal.id }, data: { revokedAt: new Date() } });
    await logPortalEvent(portal.id, "REVOKED", null, { by });
  } else if (body.action === "restore") {
    await prisma.demoPortal.update({ where: { id: portal.id }, data: { revokedAt: null } });
    await logPortalEvent(portal.id, "RESTORED", null, { by });
  } else {
    const expiresAt = body.expiresAt ? new Date(body.expiresAt.length === 10 ? `${body.expiresAt}T20:59:59Z` : body.expiresAt) : undefined;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) throw badRequest("That expiry date can't be read.");
    await prisma.demoPortal.update({
      where: { id: portal.id },
      data: { ...(expiresAt ? { expiresAt } : {}), ...(body.minuteBudget ? { minuteBudget: body.minuteBudget } : {}), ...(body.hostContact !== undefined ? { hostContact: body.hostContact || null } : {}) },
    });
    await logPortalEvent(portal.id, "UPDATED", null, { by, expiresAt: expiresAt?.toISOString(), minuteBudget: body.minuteBudget, hostContact: body.hostContact });
  }
  const updated = await prisma.demoPortal.findUniqueOrThrow({ where: { id: portal.id } });
  return json({ portal: { id: updated.id, state: portalState(updated), expiresAt: updated.expiresAt.toISOString(), minuteBudget: updated.minuteBudget }, usage: await portalUsage(updated) });
});
