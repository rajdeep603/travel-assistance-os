import { z } from "zod";
import { prisma } from "@/lib/db";
import { agentActor } from "./records";
import { defineTool } from "./types";

export const transferToHumanTool = defineTool({
  name: "transfer_to_human",
  description:
    "Hand the caller to a person. Use target 'doctor' at once for a medical emergency or red-flag symptoms; use 'case_manager' when the caller asks for a human or you cannot help. Say what you are doing before calling. The summary is read to the person before they are connected.",
  schema: z.object({
    target: z.enum(["doctor", "case_manager"]),
    reason: z.string().describe("Why the transfer is needed, in a few words"),
    summary: z.string().describe("One or two sentences the human hears before being connected"),
  }),
  async execute(args, ctx) {
    if (ctx.caseId) {
      await prisma.caseEvent.create({
        data: {
          caseId: ctx.caseId,
          type: "CALL",
          title: `${ctx.callRef} handed to ${args.target === "doctor" ? "the on-call doctor" : "a case manager"}`,
          body: `${args.reason}. ${args.summary}`,
          actor: agentActor(ctx),
        },
      });
    }
    // Saved before dialling: the whisper webhook reads it when the person answers.
    await ctx.setOutcome({ handoff: { target: args.target, reason: args.reason, summary: args.summary } });
    ctx.emit({ type: "handoff", target: args.target, reason: args.reason, summary: args.summary });
    const result = await ctx.actions.transfer(args.target, args.summary);
    return { transferring: result.ok, say: result.message };
  },
});

export const endCallTool = defineTool({
  name: "end_call",
  description: "End the call after you have said goodbye and the caller has nothing else.",
  schema: z.object({ reason: z.string().optional() }),
  async execute(args, ctx) {
    void ctx.actions.hangup(args.reason ?? "conversation complete");
    return { ending: true };
  },
});
