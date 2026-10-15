// Rewrites call summaries produced by the old offline summariser ("Voice-
// assisted intake completed over N turns. The traveller stated: …") with the
// current one, on the Call and on its case-timeline entry. Other summaries are
// left alone. Bundled and run like seed.cjs:
//   npx esbuild scripts/resummarize-calls.ts --bundle --platform=node --format=cjs \
//     --outfile=resummarize-calls.cjs --external:@prisma/client --external:pdf-parse
//   docker compose exec -T app node resummarize-calls.cjs
import { PrismaClient } from "@prisma/client";
import { runAI } from "../src/lib/services/ai";
import type { ChatMessage, ConversationSummaryContext } from "../src/lib/services/types";
import { getAgent } from "../src/lib/voice/agents/registry";

const OLD_SUMMARY = /^Voice-assisted intake completed over \d+ turns\./;
const prisma = new PrismaClient();

async function main() {
  const calls = await prisma.call.findMany({
    where: { summary: { startsWith: "Voice-assisted intake completed over" } },
    include: { conversation: true, case: { include: { patient: true } } },
    orderBy: { createdAt: "asc" },
  });
  let updated = 0;
  for (const call of calls) {
    const messages = (call.conversation?.messages ?? []) as unknown as ChatMessage[];
    if (!messages.length || !call.summary || !OLD_SUMMARY.test(call.summary)) continue;
    const profile = getAgent(call.agentProfile);
    const outcome = (call.outcome as Record<string, unknown> | null) ?? {};
    const context: ConversationSummaryContext = {
      outcome,
      status: call.status,
      agentId: call.agentProfile,
      agentLabel: profile?.label ?? null,
      channel: call.channel === "PHONE" ? "PHONE" : "BROWSER",
      direction: call.direction === "INBOUND" ? "inbound" : "outbound",
      audience: profile?.audience ?? null,
      language: call.language ?? profile?.languageHint ?? null,
      caseRef: call.case?.ref ?? null,
      patientName: call.case ? `${call.case.patient.firstName} ${call.case.patient.lastName}` : null,
      location: call.case?.location ?? null,
    };
    const summary = (await runAI("summarizeConversation", (ai) => ai.summarizeConversation(messages, context))).value;
    await prisma.call.update({ where: { id: call.id }, data: { summary } });
    if (call.caseId) {
      await prisma.caseEvent.updateMany({
        where: { caseId: call.caseId, type: "CALL", title: { contains: call.ref }, body: call.summary },
        data: { body: summary },
      });
    }
    updated++;
    console.log(`${call.ref}: ${summary}`);
  }
  console.log(`Rewrote ${updated} of ${calls.length} old summaries.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
