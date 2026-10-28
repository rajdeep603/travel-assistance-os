import type { OutboundMessage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { emailServiceFor, type EmailAttachment } from "./email";
import { getFaxService } from "./fax";
import { getTelephony } from "./telephony";

// The outbox: every e-mail and fax the platform sends is recorded first,
// then handed to the provider, and its result (sent / failed) stored.

interface Common {
  caseId?: string | null;
  inReplyToId?: string | null;
  automatic?: boolean;
  approvedBy?: string | null;
  attachmentDocumentId?: string | null;
}

export async function sendEmail(
  input: Common & { to: string; subject: string; text: string; html?: string; attachments?: EmailAttachment[]; threadId?: string; replyTo?: string }
): Promise<OutboundMessage> {
  const email = emailServiceFor(input.to);
  const row = await prisma.outboundMessage.create({
    data: {
      channel: "EMAIL",
      toAddress: input.to,
      subject: input.subject,
      body: input.text,
      provider: email.name,
      automatic: input.automatic ?? true,
      approvedBy: input.approvedBy ?? null,
      caseId: input.caseId ?? null,
      inReplyToId: input.inReplyToId ?? null,
      attachmentDocumentId: input.attachmentDocumentId ?? null,
    },
  });
  try {
    const { id } = await email.send({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments,
      inReplyTo: input.threadId,
      replyTo: input.replyTo,
    });
    return prisma.outboundMessage.update({
      where: { id: row.id },
      data: { status: "SENT", providerMessageId: id, sentAt: new Date() },
    });
  } catch (err) {
    console.error("[outbox] e-mail failed:", err);
    return prisma.outboundMessage.update({
      where: { id: row.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 500) : "send failed" },
    });
  }
}

export async function sendFax(
  input: Common & { to: string; pdf: Buffer; filename: string; cover: string }
): Promise<OutboundMessage> {
  const fax = getFaxService();
  const row = await prisma.outboundMessage.create({
    data: {
      channel: "FAX",
      toAddress: input.to,
      subject: input.filename,
      body: input.cover,
      provider: fax.name,
      automatic: input.automatic ?? true,
      approvedBy: input.approvedBy ?? null,
      caseId: input.caseId ?? null,
      inReplyToId: input.inReplyToId ?? null,
      attachmentDocumentId: input.attachmentDocumentId ?? null,
    },
  });
  try {
    const { id } = await fax.send(input.to, input.pdf, input.filename);
    return prisma.outboundMessage.update({
      where: { id: row.id },
      data: { status: "SENT", providerMessageId: id, sentAt: new Date() },
    });
  } catch (err) {
    console.error("[outbox] fax failed:", err);
    return prisma.outboundMessage.update({
      where: { id: row.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 500) : "send failed" },
    });
  }
}

/**
 * A WhatsApp reply. Sent through Twilio when a WhatsApp sender is configured
 * (TWILIO_WHATSAPP_FROM: the sandbox number, or an approved business sender);
 * otherwise recorded in the outbox like the mock fax.
 */
export async function sendWhatsApp(input: Common & { to: string; text: string; simulate?: boolean }): Promise<OutboundMessage> {
  const telephony = getTelephony();
  // `simulate`: a fictional demo number, recorded like the mock but never sent.
  const live = !input.simulate && telephony.configured && !!process.env.TWILIO_WHATSAPP_FROM;
  const row = await prisma.outboundMessage.create({
    data: {
      channel: "WHATSAPP",
      toAddress: input.to,
      body: input.text,
      provider: live ? "twilio-whatsapp" : "mock",
      automatic: input.automatic ?? true,
      approvedBy: input.approvedBy ?? null,
      caseId: input.caseId ?? null,
      inReplyToId: input.inReplyToId ?? null,
    },
  });
  try {
    const { sid } = live ? await telephony.sendWhatsApp(input.to, input.text) : { sid: `mock_wa_${row.id}` };
    return prisma.outboundMessage.update({ where: { id: row.id }, data: { status: "SENT", providerMessageId: sid, sentAt: new Date() } });
  } catch (err) {
    console.error("[outbox] WhatsApp failed:", err);
    return prisma.outboundMessage.update({
      where: { id: row.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 500) : "send failed" },
    });
  }
}
