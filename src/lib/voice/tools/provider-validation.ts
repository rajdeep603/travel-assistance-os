import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getEmailService } from "@/lib/services/email";
import { getTelephony } from "@/lib/services/telephony";
import { defineTool } from "./types";

// ---------------------------------------------------------------------------
// Tools of the provider-validation agent (calls placed through the public API
// by a client's provider-network tool): what the practice confirmed about
// itself, and the price-list link sent to it.
// ---------------------------------------------------------------------------

const price = z.object({
  item: z.string().describe("What was priced, in the brief's words (e.g. 'Urgent care visit')"),
  amount: z.number().describe("Plain number"),
  currency: z.string().describe("ISO code, e.g. USD"),
  note: z.string().optional().describe("e.g. 'from', 'cash price', 'per night'"),
});

export const recordProviderValidationTool = defineTool({
  name: "record_provider_validation",
  description:
    "Save what the practice told you about itself: whether you reached the right place, whether it still operates at the address, its hours, which of the listed services it offers, whether it accepts international patients and direct billing from an assistance company, the prices quoted, and who you spoke to. Call it once, before ending, with everything you learned; use null for what you couldn't find out.",
  schema: z.object({
    reached_right_place: z.boolean().describe("The number belongs to the provider in the brief"),
    operating: z.boolean().nullable().describe("Still open for business at the address; null if unknown"),
    closed_or_moved: z.string().optional().describe("What they said if it closed, moved or changed name"),
    new_address: z.string().optional(),
    hours: z.string().optional().describe("Opening hours as stated"),
    services_confirmed: z.array(z.string()).optional().describe("From the brief's list, the services they offer"),
    services_not_offered: z.array(z.string()).optional(),
    accepts_international_patients: z.boolean().nullable().optional(),
    accepts_direct_billing: z.boolean().nullable().optional().describe("Bills the assistance company directly against a guarantee of payment"),
    prices: z.array(price).optional(),
    contact_name: z.string().optional(),
    contact_role: z.string().optional(),
    contact_email: z.string().optional(),
    contact_mobile: z.string().optional(),
    notes: z.string().optional().describe("Anything else worth knowing (languages, parking, interpreter, appointment lead time)"),
  }),
  async execute(args, ctx) {
    await ctx.setOutcome({ providerValidation: args as Prisma.InputJsonValue });
    ctx.emit({ type: "provider_validation", validation: args });
    return { saved: true };
  },
});

export const sendPriceListLinkTool = defineTool({
  name: "send_price_list_link",
  description:
    "Send the practice the link from the brief where they can upload their price list or fill in a short price form, by text message or e-mail. Confirm the number or address with them first (read it back).",
  schema: z.object({
    channel: z.enum(["sms", "email"]),
    to: z.string().describe("Mobile number in international format, or e-mail address"),
  }),
  async execute(args, ctx) {
    const call = await prisma.call.findUnique({ where: { id: ctx.callId }, select: { outcome: true } });
    const brief = (call?.outcome as { brief?: { price_list_link?: string; client?: string } } | null)?.brief;
    const link = brief?.price_list_link;
    if (!link) return { sent: false, reason: "No price-list link is on this call; tell them the network team will e-mail it." };
    const client = brief?.client ?? "the assistance company";
    const text = `${client}: thank you for your time on the phone. Please confirm your practice details and share your prices here: ${link}`;
    let sent = false;
    let reason: string | null = null;
    try {
      if (args.channel === "sms") {
        const telephony = getTelephony();
        if (!telephony.configured) reason = "Text messages aren't set up on this server.";
        else {
          await telephony.sendSms(args.to.replace(/[^\d+]/g, ""), text);
          sent = true;
        }
      } else {
        const email = getEmailService();
        if (!email.configured) reason = "E-mail isn't set up on this server.";
        else {
          await email.send({ to: args.to, subject: `${client}: your practice details and price list`, text: `${text}\n\nThe link is personal to your practice and works on a phone.` });
          sent = true;
        }
      }
    } catch (err) {
      reason = err instanceof Error ? err.message.slice(0, 200) : "sending failed";
    }
    await ctx.setOutcome({ priceLinkSent: { channel: args.channel, to: args.to, sent, reason } as Prisma.InputJsonValue });
    ctx.emit({ type: "price_link", channel: args.channel, to: args.to, sent });
    return sent ? { sent: true } : { sent: false, reason: `${reason ?? "Sending failed."} Tell them the network team will send it shortly, and that you have noted the ${args.channel === "sms" ? "number" : "address"}.` };
  },
});
