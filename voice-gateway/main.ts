import { retryUnansweredCalls } from "@/lib/services/outbound-calls";
import { closeOrphanedCalls, purgeExpiredCallData } from "@/lib/voice/retention";
import { createGateway } from "./gateway";

// Entry point: `npm run dev:gateway` in development, `node voice-gateway.cjs`
// in the production image (bundled with esbuild, like the seed script).

if (process.env.NODE_ENV !== "production") {
  // Development: read .env like Next.js does.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config();
}

const port = Number(process.env.VOICE_GATEWAY_PORT ?? 8080);
const gateway = createGateway({
  allowedOrigins: [process.env.PUBLIC_BASE_URL ?? "", process.env.NEXT_PUBLIC_APP_URL ?? ""].map((u) =>
    u ? new URL(u).origin : ""
  ),
});

gateway.server.listen(port, () => {
  console.log(`[gateway] listening on :${port}${process.env.XAI_API_KEY ? "" : " (XAI_API_KEY not set: voice sessions will fail)"}`);
});

// Calls a killed predecessor left open would show "In progress" for ever.
closeOrphanedCalls()
  .then((n) => n && console.log(`[gateway] closed ${n} call(s) left open by the previous process`))
  .catch((err) => console.error("[gateway] closing orphaned calls failed:", err));

// Erase expired phone transcripts at start-up and every six hours.
const purge = () =>
  purgeExpiredCallData()
    .then((n) => n && console.log(`[gateway] retention: purged ${n} expired call transcript(s)`))
    .catch((err) => console.error("[gateway] retention job failed:", err));
void purge();
const purgeTimer = setInterval(purge, 6 * 60 * 60 * 1000);
purgeTimer.unref();

// Retry unanswered outbound calls once (checked every minute).
const retryTimer = setInterval(() => {
  retryUnansweredCalls()
    .then((n) => n && console.log(`[gateway] retried ${n} unanswered outbound call(s)`))
    .catch((err) => console.error("[gateway] outbound retry sweep failed:", err));
}, 60_000);
retryTimer.unref();

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    console.log(`[gateway] ${signal}: finishing ${gateway.activeSessions()} active session(s)…`);
    await gateway.close();
    process.exit(0);
  });
}
