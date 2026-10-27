import { json, withErrorHandling } from "@/lib/api";
import { callsConfigured } from "@/lib/services/lead-meetings";

export const dynamic = "force-dynamic";

/** Whether the quotation can offer a Teams call, and which mailbox the invite comes from. */
export const GET = withErrorHandling(async () => json(callsConfigured()));
