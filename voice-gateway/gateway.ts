import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { operatorFromCookieHeader } from "@/lib/auth/session";
import { gatewaySecret, verifyToken } from "@/lib/auth/tokens";
import { getAgent } from "@/lib/voice/agents/registry";
import { liveSessions, runVoiceSession } from "@/lib/voice/bridge";
import { BrowserLeg } from "@/lib/voice/legs/browser-leg";
import { TwilioLeg, type TwilioStartInfo } from "@/lib/voice/legs/twilio-leg";
import { joinAsHospital, joinAsManager } from "@/lib/voice/interpreter";
import { monitorBus } from "@/lib/voice/monitor";
import { twilioCallControls } from "@/lib/voice/twilio-controls";

// ---------------------------------------------------------------------------
// The voice gateway: a small WebSocket server beside the Next.js app (which
// can't hold long-lived sockets). It carries live audio between callers and
// Grok Voice and streams call activity to the Call Center view.
//
//   /ws/voice?ticket=…   browser voice sessions (ticket minted by /api/voice/session)
//   /ws/twilio           Twilio Media Streams (ticket in the stream's <Parameter>)
//   /ws/interpreter      case manager's browser leg of an interpreted call
//   /ws/monitor          live call monitor for signed-in operators
//   /healthz             liveness for Docker and nginx
// ---------------------------------------------------------------------------

export interface GatewayOptions {
  /** Override the model endpoint/key (tests point this at a fake server). */
  model?: { url?: string; apiKey?: string; name?: string };
  /** Origins allowed to open browser sockets; empty = same-host check only. */
  allowedOrigins?: string[];
  log?: (msg: string) => void;
}

export type VoiceTicket = {
  kind: "browser-voice";
  callId: string;
  profile: string;
};

export type MediaTicket = {
  kind: "twilio-media";
  callId: string;
  profile: string;
};

const timeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

export function createGateway(opts: GatewayOptions = {}) {
  const log = opts.log ?? ((m: string) => console.log(`[gateway] ${m}`));
  const sessions = new Set<Promise<void>>();
  const sockets = new Set<WebSocket>();

  const server = http.createServer(async (req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", activeSessions: sessions.size, model: env.xaiVoiceModel }));
      return;
    }
    // App → gateway notifications about live calls (answering-machine detection).
    const amd = req.method === "POST" && req.url?.match(/^\/internal\/calls\/([^/]+)\/answered-by$/);
    if (amd) {
      const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      const ok = (await verifyToken<{ kind: string }>(token, gatewaySecret()))?.kind === "internal";
      if (!ok) {
        res.writeHead(401).end();
        return;
      }
      let body = "";
      for await (const chunk of req) body += chunk;
      const { answeredBy } = JSON.parse(body || "{}") as { answeredBy?: string };
      const handle = liveSessions.get(decodeURIComponent(amd[1]));
      if (handle && answeredBy) handle.answeredBy(answeredBy);
      res.writeHead(handle ? 204 : 404).end();
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  function originAllowed(req: http.IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin) return true; // non-browser clients (Twilio, tests) send none
    const allowed = opts.allowedOrigins?.filter(Boolean) ?? [];
    if (allowed.length) return allowed.includes(origin);
    try {
      const host = new URL(origin).hostname;
      const reqHost = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "").toString().split(":")[0];
      return host === reqHost || host === "localhost" || host === "127.0.0.1";
    } catch {
      return false;
    }
  }

  function reject(socket: import("node:stream").Duplex, code: number, message: string) {
    socket.write(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }

  server.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://gateway");
    try {
      if (!originAllowed(req)) return reject(socket, 403, "Forbidden");

      if (url.pathname === "/ws/voice") {
        const ticket = await verifyToken<VoiceTicket>(url.searchParams.get("ticket"), gatewaySecret());
        if (!ticket || ticket.kind !== "browser-voice") return reject(socket, 401, "Unauthorized");
        const profile = getAgent(ticket.profile);
        if (!profile) return reject(socket, 400, "Bad Request");
        wss.handleUpgrade(req, socket, head, (ws) => {
          sockets.add(ws);
          ws.on("close", () => sockets.delete(ws));
          const leg = new BrowserLeg(ws);
          const run = runVoiceSession({ leg, profile, callId: ticket.callId, model: opts.model })
            .catch((err) => {
              log(`session ${ticket.callId} crashed: ${err instanceof Error ? err.message : err}`);
              leg.close("internal error");
            })
            .finally(() => sessions.delete(run));
          sessions.add(run);
        });
        return;
      }

      if (url.pathname === "/ws/twilio") {
        // Twilio can't add headers or query strings, so authentication happens
        // on the stream's "start" event (signed ticket + matching CallSid).
        wss.handleUpgrade(req, socket, head, async (ws) => {
          sockets.add(ws);
          ws.on("close", () => sockets.delete(ws));
          const leg = new TwilioLeg(ws);
          let start: TwilioStartInfo;
          try {
            start = await timeout(leg.started, 10_000);
          } catch {
            leg.close("no start event");
            return;
          }
          const ticket = await verifyToken<MediaTicket>(start.customParameters.ticket, gatewaySecret());
          const call = ticket?.kind === "twilio-media" ? await prisma.call.findUnique({ where: { id: ticket.callId } }) : null;
          const profile = ticket ? getAgent(ticket.profile) : undefined;
          if (!ticket || !call || call.twilioCallSid !== start.callSid || !profile) {
            log(`rejected media stream for ${start.callSid}`);
            leg.close("unauthorized");
            return;
          }
          if (call.bridgeId) {
            // The hospital leg of an interpreted call: joins the bridge, not an agent.
            const run = joinAsHospital(call.bridgeId, leg, twilioCallControls(call.id, start.callSid), opts.model)
              .catch((err) => {
                log(`interpreter leg ${call.ref} crashed: ${err instanceof Error ? err.message : err}`);
                leg.close("internal error");
              })
              .finally(() => sessions.delete(run));
            sessions.add(run);
            return;
          }
          const run = runVoiceSession({
            leg,
            profile,
            callId: call.id,
            controls: twilioCallControls(call.id, start.callSid),
            brief: (call.outcome as { brief?: Record<string, unknown> } | null)?.brief ?? null,
            model: opts.model,
          })
            .catch((err) => {
              log(`phone session ${call.ref} crashed: ${err instanceof Error ? err.message : err}`);
              leg.close("internal error");
            })
            .finally(() => sessions.delete(run));
          sessions.add(run);
        });
        return;
      }

      if (url.pathname === "/ws/interpreter") {
        const ticket = await verifyToken<{ kind: string; bridgeId: string }>(url.searchParams.get("ticket"), gatewaySecret());
        if (!ticket || ticket.kind !== "interpreter-manager") return reject(socket, 401, "Unauthorized");
        wss.handleUpgrade(req, socket, head, (ws) => {
          sockets.add(ws);
          ws.on("close", () => sockets.delete(ws));
          const leg = new BrowserLeg(ws);
          const run = joinAsManager(ticket.bridgeId, leg, opts.model)
            .catch((err) => {
              log(`interpreter manager leg crashed: ${err instanceof Error ? err.message : err}`);
              leg.close("internal error");
            })
            .finally(() => sessions.delete(run));
          sessions.add(run);
        });
        return;
      }

      if (url.pathname === "/ws/monitor") {
        const operator = await operatorFromCookieHeader(req.headers.cookie);
        if (!operator) return reject(socket, 401, "Unauthorized");
        wss.handleUpgrade(req, socket, head, (ws) => {
          sockets.add(ws);
          ws.send(JSON.stringify({ type: "snapshot", calls: monitorBus.snapshot() }));
          const unsubscribe = monitorBus.subscribe((event) => {
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
          });
          ws.on("close", () => {
            unsubscribe();
            sockets.delete(ws);
          });
        });
        return;
      }

      reject(socket, 404, "Not Found");
    } catch (err) {
      log(`upgrade failed: ${err instanceof Error ? err.message : err}`);
      reject(socket, 500, "Internal Server Error");
    }
  });

  return {
    server,
    activeSessions: () => sessions.size,
    async close(): Promise<void> {
      for (const ws of sockets) ws.close(1001, "gateway shutting down");
      await Promise.race([Promise.allSettled([...sessions]), new Promise((r) => setTimeout(r, 25_000))]);
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await prisma.$disconnect();
    },
  };
}
