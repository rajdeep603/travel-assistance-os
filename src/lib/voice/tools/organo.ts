import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { crmCall, CrmUnavailable } from "./crm-connector";
import { defineTool, type ToolContext } from "./types";

// ---------------------------------------------------------------------------
// Tools of Organo Eco Habitats' lead call-back and sales line (the Organo
// POC), working in Organo's own sales system through crmCall: leads, visit
// slots, site visits and WhatsApp messages stay there. The outbound call-back
// knows its lead from the brief (brief.lead.ref); the sales line records the
// caller as a new lead first (save_lead_profile with lead_ref null) and keeps
// the returned reference on the call (outcome.lead.ref) for the later steps.
// ---------------------------------------------------------------------------

interface Brief {
  client?: string;
  callback_promise?: string;
  lead?: { ref?: string; name?: string } | null;
  _crm_url?: string;
  _collector_number?: string;
}

interface LeadOnCall {
  ref?: string;
  name?: string;
  address_as?: string | null;
}

async function stateOf(ctx: ToolContext): Promise<{ brief: Brief; lead: LeadOnCall | null }> {
  const call = await prisma.call.findUnique({ where: { id: ctx.callId }, select: { outcome: true } });
  const outcome = (call?.outcome as Record<string, unknown> | null) ?? {};
  return { brief: (outcome.brief as Brief | undefined) ?? {}, lead: (outcome.lead as LeadOnCall | undefined) ?? null };
}

/** The lead this call works on: the one saved on the call, else the brief's (outbound). */
const leadRefOf = (brief: Brief, lead: LeadOnCall | null): string | null => lead?.ref ?? (typeof brief.lead?.ref === "string" && brief.lead.ref ? brief.lead.ref : null);

const SYSTEM_DOWN = {
  error:
    "Organo's sales system isn't answering just now. Apologise briefly, make sure you have their name and mobile number, and say a relationship manager will call them back within 30 minutes with the details and to fix the visit. Don't promise a slot.",
};

async function system<T>(ctx: ToolContext, brief: Brief, action: string, args: Record<string, unknown>): Promise<T | { error: string }> {
  try {
    return await crmCall<T>(brief._crm_url, ctx.callRef, action, args);
  } catch (err) {
    if (err instanceof CrmUnavailable) {
      console.warn(`[organo] ${ctx.callRef} ${action}: ${err.message}`);
      return SYSTEM_DOWN;
    }
    throw err;
  }
}

async function requireLead(ctx: ToolContext): Promise<{ brief: Brief; leadRef: string } | { error: string }> {
  const { brief, lead } = await stateOf(ctx);
  const leadRef = leadRefOf(brief, lead);
  if (!leadRef) return { error: "There's no lead on this call yet. Ask for their name and the mobile number on WhatsApp (read it back), call save_lead_profile with lead_ref null, then try again." };
  return { brief, leadRef };
}

const PURPOSES = ["own_use", "second_home", "investment", "retirement", "rental", "not_sure"] as const;

export const saveLeadProfileTool = defineTool({
  name: "save_lead_profile",
  description:
    "Record the lead in Organo's sales system with what they are looking for. On the call-back, use the lead_ref from the brief's lead; on the sales line, the first time use lead_ref null with their name and the mobile number they confirmed (a new lead is created and its reference kept on the call). Call it once discovery is done, and again only if something important changes. Everything in English.",
  schema: z.object({
    lead_ref: z.string().nullable().describe("The brief's lead.ref (OL-…) on a call-back; null on the sales line the first time"),
    name: z.string().optional().describe("Full name as given"),
    phone: z.string().optional().describe("Mobile number on WhatsApp as confirmed, with the country code if given, e.g. '+91 98490 12345'"),
    email: z.string().optional(),
    preferred_projects: z.array(z.string()).optional().describe("Communities they like, named as in the catalogue, e.g. ['Kandawada', 'Palgutta']"),
    configuration: z.string().optional().describe("e.g. '3 BHK villa', 'serviced studio'"),
    budget_band: z.string().optional().describe("e.g. '2–3 Cr', '6–8 Cr', 'Above 8 Cr'"),
    purpose: z.enum(PURPOSES).optional(),
    timeline: z.string().optional().describe("e.g. 'within 3 months', 'exploring'"),
    family: z.string().optional().describe("Who will live there, e.g. 'couple with two children and parents'"),
    current_city: z.string().optional().describe("Where they live now, e.g. 'Gachibowli, Hyderabad', 'Dubai'"),
    nri: z.boolean().optional(),
    language: z.string().optional().describe("The language of the call: English, Hindi, Telugu…"),
    questions_for_sales: z.array(z.string()).optional().describe("Questions for the relationship manager (price, payment plan, possession, loans, legal…), in English"),
    notes: z.string().optional().describe("Anything else the relationship manager should know, in English"),
  }),
  async execute(args, ctx) {
    const { brief, lead } = await stateOf(ctx);
    const leadRef = args.lead_ref?.trim() || leadRefOf(brief, lead);
    if (!leadRef && (!args.name?.trim() || !args.phone?.trim())) {
      return { saved: false, reason: "A new lead needs their name and a mobile number they have confirmed. Ask for what is missing, read the number back, then call save_lead_profile again." };
    }
    const res = await system<{ lead?: { ref: string; name?: string; address_as?: string | null }; created?: boolean }>(ctx, brief, "save_lead_profile", { ...args, lead_ref: leadRef });
    if ("error" in res) return res;
    if (!res.lead?.ref) return { saved: false, error: "The lead could not be saved. Apologise and say a relationship manager will call them back within 30 minutes." };
    await ctx.setOutcome({ lead: { ref: res.lead.ref, name: res.lead.name ?? args.name ?? lead?.name ?? null, address_as: res.lead.address_as ?? null } as Prisma.InputJsonValue, leadProfile: args as unknown as Prisma.InputJsonValue });
    ctx.emit({ type: "lead_profile", leadRef: res.lead.ref, created: Boolean(res.created) });
    return { saved: true, lead: res.lead, created: Boolean(res.created) };
  },
});

export const checkVisitSlotsTool = defineTool({
  name: "check_visit_slots",
  description:
    "The open site-visit slots at a community in Organo's sales system (at most six, from the date given or the next days). Offer two or three of them; never a slot it didn't return.",
  schema: z.object({
    project: z.string().describe("The community, as named in the catalogue, e.g. 'Kandawada'"),
    from_date: z.string().optional().describe("YYYY-MM-DD, the first day they could come"),
  }),
  async execute(args, ctx) {
    const v = await requireLead(ctx);
    if ("error" in v) return v;
    const res = await system<{ project?: { name: string }; slots?: { id: string; date: string; label: string }[]; say?: string }>(ctx, v.brief, "visit_slots", { lead_ref: v.leadRef, project: args.project, from_date: args.from_date ?? null });
    if ("error" in res) return res;
    ctx.emit({ type: "visit_slots", project: res.project?.name ?? args.project, count: res.slots?.length ?? 0 });
    if (!res.slots?.length) return { ...res, say: res.say ?? "No open slots then. Offer to have the relationship manager call to fix a time, or another day." };
    return res;
  },
});

export const bookSiteVisitTool = defineTool({
  name: "book_site_visit",
  description:
    "Book the site visit the person chose, in Organo's sales system, with a slot_id from check_visit_slots. Returns the visit reference to read back, and sends the location pin, the tabloid and the visit details on their WhatsApp. If the slot is gone, offer the others.",
  schema: z.object({
    project: z.string().describe("The community, as named in the catalogue"),
    slot_id: z.string().optional().describe("The id of the chosen slot, from check_visit_slots"),
    date: z.string().optional().describe("YYYY-MM-DD, only if there is no slot_id"),
    time: z.string().optional().describe("HH:MM, only if there is no slot_id"),
    visitors: z.number().optional().describe("How many people will come"),
    notes: z.string().optional().describe("In English, e.g. 'bringing parents; wants to see the farms'"),
  }),
  async execute(args, ctx) {
    const v = await requireLead(ctx);
    if ("error" in v) return v;
    if (!args.slot_id && !(args.date && args.time)) return { booked: false, reason: "Choose a slot from check_visit_slots first (its slot_id)." };
    const res = await system<{ visit?: { ref: string; spoken?: string; label?: string; project?: string; location?: string }; whatsapp?: { sent?: boolean; items?: string[] }; say?: string; error?: string }>(ctx, v.brief, "book_visit", { lead_ref: v.leadRef, ...args });
    if ("error" in res && !("visit" in res && res.visit)) return { booked: false, ...res };
    if (!res.visit?.ref) return { booked: false, error: "The visit could not be booked. Apologise and say the relationship manager will call to fix the time." };
    await ctx.setOutcome({ visit: { ...res.visit, slot_id: args.slot_id ?? null, visitors: args.visitors ?? null } as Prisma.InputJsonValue });
    ctx.emit({ type: "visit_booked", visitRef: res.visit.ref, project: res.visit.project ?? args.project });
    return { booked: true, ...res, say: res.say ?? "Read the visit reference back slowly (as in 'spoken'), then the day and time once more, and say the details are on their WhatsApp." };
  },
});

const WHATSAPP_ITEMS = ["brochure", "location", "walkthrough_video", "project_comparison"] as const;

export const sendWhatsappInfoTool = defineTool({
  name: "send_whatsapp_info",
  description:
    "Send the lead information on WhatsApp from Organo's sales system: the community's brochure (tabloid), the location pin, a walkthrough video, or a comparison of two communities. Say what you're sending first.",
  schema: z.object({
    items: z.array(z.enum(WHATSAPP_ITEMS)).min(1),
    projects: z.array(z.string()).min(1).describe("The communities, as named in the catalogue"),
  }),
  async execute(args, ctx) {
    const v = await requireLead(ctx);
    if ("error" in v) return v;
    const res = await system<{ sent?: boolean; to?: string; say?: string }>(ctx, v.brief, "send_whatsapp", { lead_ref: v.leadRef, items: args.items, projects: args.projects });
    if ("error" in res) return { sent: false, ...res };
    await ctx.setOutcome({ whatsapp: { items: args.items, projects: args.projects, sent: Boolean(res.sent), to: res.to ?? null } as Prisma.InputJsonValue });
    ctx.emit({ type: "whatsapp", items: args.items, projects: args.projects, sent: Boolean(res.sent) });
    return { sent: Boolean(res.sent), ...res };
  },
});

const OUTCOMES = ["visit_booked", "callback_scheduled", "info_sent", "not_interested", "do_not_call", "wrong_person", "handed_to_sales", "expo_confirmed", "no_answer"] as const;

export const recordLeadCallTool = defineTool({
  name: "record_lead_call",
  description: "Save how the call ended in Organo's sales system: the outcome, how warm the lead is, the next action and a short summary in English. Call it once, before your goodbye.",
  schema: z.object({
    outcome: z.enum(OUTCOMES),
    score: z.enum(["hot", "warm", "cold"]).describe("hot: wants to visit soon or talk price, and fits; warm: interested, exploring; cold: no fit or not interested"),
    next_action: z.string().optional().describe("e.g. 'site visit Sat 28 Nov 11 am', 'relationship manager to call about payment plans'"),
    callback_time: z.string().optional().describe("When to call back, as agreed (YYYY-MM-DD HH:MM or in words)"),
    summary: z.string().describe("Two sentences in English: who they are, what they want, what was agreed"),
  }),
  async execute(args, ctx) {
    const { brief, lead } = await stateOf(ctx);
    const leadRef = leadRefOf(brief, lead);
    await ctx.setOutcome({ leadCall: args as unknown as Prisma.InputJsonValue });
    ctx.emit({ type: "lead_call", leadCall: args });
    if (leadRef) void system(ctx, brief, "call_outcome", { lead_ref: leadRef, ...args }).catch(() => undefined);
    return { saved: true };
  },
});

export const handToSalesManagerTool = defineTool({
  name: "hand_to_sales_manager",
  description:
    "Pass the person to Organo's team: a relationship manager when they want to talk price or negotiate, are ready to book a home, ask for a person, have a complaint, or ask what you can't answer; Organo Facilities Management for a homeowner's service problem. Say what you are doing first. The summary is what the team reads before taking over.",
  schema: z.object({
    reason: z.enum(["asked_for_person", "pricing_negotiation", "ready_to_book", "homeowner_service", "complaint", "cannot_help"]),
    summary: z.string().describe("Two or three sentences in English: who, what they want, anything already agreed (visit, budget, community)"),
  }),
  async execute(args, ctx) {
    const { brief, lead } = await stateOf(ctx);
    const leadRef = leadRefOf(brief, lead);
    const team = args.reason === "homeowner_service" ? "Organo Facilities Management" : "a relationship manager";
    await ctx.setOutcome({ handoff: { target: args.reason === "homeowner_service" ? "facilities" : "sales_manager", reason: args.reason, summary: args.summary, at: new Date().toISOString() } });
    ctx.emit({ type: "handoff", target: args.reason === "homeowner_service" ? "facilities" : "sales_manager", reason: args.reason, summary: args.summary });
    const fromSystem = await system<{ ok?: boolean; say?: string }>(ctx, brief, "handoff", { lead_ref: leadRef, reason: args.reason, summary: args.summary }).catch(() => null);
    const say = fromSystem && !("error" in fromSystem) ? fromSystem.say : undefined;
    if (ctx.channel === "PHONE" && args.reason !== "homeowner_service" && typeof brief._collector_number === "string" && brief._collector_number) {
      const result = await ctx.actions.transfer("collector", args.summary);
      if (result.ok) return { transferring: true, say: "Say you are connecting them to a relationship manager now and that you have passed on a summary, so they won't have to repeat themselves." };
      return { transferring: false, say: result.message };
    }
    const promise = args.reason === "homeowner_service" ? "the Facilities Management team calls them back shortly" : brief.callback_promise ?? "a relationship manager calls them back within 30 minutes";
    return {
      transferring: false,
      say: `${say ?? `Say ${team} has the summary and that ${promise}; make sure you have their number.`} Then make sure record_lead_call has been called, say goodbye and end the call with end_call: nobody will join this line.`,
    };
  },
});

export const ORGANO_TOOLS = [saveLeadProfileTool, checkVisitSlotsTool, bookSiteVisitTool, sendWhatsappInfoTool, recordLeadCallTool, handToSalesManagerTool];
