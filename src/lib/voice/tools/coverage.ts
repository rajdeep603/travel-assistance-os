import { z } from "zod";
import { checkCoverage } from "@/lib/services/policy";
import { defineTool } from "./types";

export const checkCoverageTool = defineTool({
  name: "check_coverage",
  description:
    "Check what a caller's travel policy covers (e.g. flight delay, dental, hospital). Requires the policy number and the policyholder's date of birth to verify identity. Answer only from what this returns, give the limit and conditions, and always mention that the claims team makes the final decision.",
  schema: z.object({
    policy_number: z.string().describe("e.g. POL-TR-100944"),
    date_of_birth: z.string().describe("Policyholder's date of birth as YYYY-MM-DD"),
    benefit: z
      .string()
      .optional()
      .describe("What they ask about, e.g. 'flight delay', 'dental', 'hospital admission'"),
  }),
  async execute(args, ctx) {
    const result = await checkCoverage({
      policyNumber: args.policy_number,
      dateOfBirth: args.date_of_birth,
      benefit: args.benefit,
    });
    if (!result.verified) {
      return {
        verified: false,
        say: "Ask the caller to repeat the policy number and date of birth. After two failed attempts, offer a case manager call-back instead.",
      };
    }
    await ctx.setOutcome({
      coverageChecked: {
        policy: result.policyNumber,
        benefit: result.benefit?.code ?? null,
        covered: result.benefit?.covered ?? null,
      },
    });
    ctx.emit({
      type: "coverage",
      plan: result.plan,
      benefit: result.benefit?.label ?? null,
      covered: result.benefit?.covered ?? null,
    });
    return result;
  },
});
