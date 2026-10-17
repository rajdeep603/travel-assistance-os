import { z } from "zod";
import { ApiError } from "@/lib/errors";
import type { RealtimeFunctionTool } from "../realtime/xai-session";
import { findProvidersTool, lookupCaseTool, openRecordTool, searchRecordsTool } from "./assistant";
import { bookAppointmentTool, searchProvidersTool } from "./booking";
import { endCallTool, transferToHumanTool } from "./call-control";
import {
  addCaseNoteTool,
  createCaseTool,
  findMyCaseTool,
  getCaseStatusTool,
  getClaimStatusTool,
  searchKnowledgeTool,
} from "./cases";
import { checkCoverageTool } from "./coverage";
import { recordBillAgreementTool, recordTransportAssessmentTool } from "./money";
import {
  cancelAppointmentTool,
  confirmAppointmentTool,
  confirmLogReceiptTool,
  recordFollowupTool,
  recordHospitalUpdateTool,
  sendUploadLinkTool,
} from "./outbound";
import { findGuaranteeTool, requestGuaranteeIncreaseTool, resendGuaranteeTool } from "./provider";
import type { ToolContext, VoiceTool } from "./types";

const ALL_TOOLS: VoiceTool[] = [
  searchProvidersTool,
  bookAppointmentTool,
  createCaseTool,
  addCaseNoteTool,
  getCaseStatusTool,
  findMyCaseTool,
  getClaimStatusTool,
  searchKnowledgeTool,
  checkCoverageTool,
  recordHospitalUpdateTool,
  recordFollowupTool,
  confirmAppointmentTool,
  cancelAppointmentTool,
  sendUploadLinkTool,
  confirmLogReceiptTool,
  findGuaranteeTool,
  resendGuaranteeTool,
  requestGuaranteeIncreaseTool,
  recordBillAgreementTool,
  recordTransportAssessmentTool,
  lookupCaseTool,
  searchRecordsTool,
  findProvidersTool,
  openRecordTool,
  transferToHumanTool,
  endCallTool,
] as VoiceTool[];

const BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]));

/** Registers more tools (later phases add coverage, hospital updates, …). */
export function registerTools(tools: VoiceTool[]): void {
  for (const t of tools) BY_NAME.set(t.name, t);
}

export function getTool(name: string): VoiceTool | undefined {
  return BY_NAME.get(name);
}

/** Realtime-API function definitions for the named tools. */
export function realtimeTools(names: string[]): RealtimeFunctionTool[] {
  return names.map((name) => {
    const tool = BY_NAME.get(name);
    if (!tool) throw new Error(`Unknown voice tool "${name}"`);
    const parameters = z.toJSONSchema(tool.schema) as Record<string, unknown>;
    delete parameters.$schema;
    return { type: "function", name: tool.name, description: tool.description, parameters };
  });
}

/**
 * Validates and runs one function call from the model. Never throws: the
 * model always gets an answer it can act on (a result or an error to relay).
 */
export async function executeTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
  allowed: string[]
): Promise<Record<string, unknown>> {
  const tool = BY_NAME.get(name);
  if (!tool || !allowed.includes(name)) return { error: `Tool "${name}" is not available on this call.` };
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    return {
      error: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`,
    };
  }
  try {
    return await tool.execute(parsed.data, ctx);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    console.error(`[voice] tool ${name} failed on ${ctx.callRef}:`, err);
    return { error: "The system could not complete that just now. Apologise and offer a case manager call-back." };
  }
}
