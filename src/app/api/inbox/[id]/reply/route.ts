import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { sendEmail, sendWhatsApp } from "@/lib/services/outbox";

export const dynamic = "force-dynamic";

const Body = z.object({ body: z.string().trim().min(10).max(10000) });

/** Operator approves (optionally edits) the drafted reply and sends it. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const { body } = Body.parse(await req.json().catch(() => ({})));
  const message = await prisma.inboundMessage.findUnique({
    where: { id: params.id },
    include: { replies: { where: { status: "QUEUED", automatic: false } } },
  });
  if (!message) throw notFound("Message");
  if (message.channel !== "EMAIL" && message.channel !== "WHATSAPP") throw badRequest("Only e-mails and WhatsApp messages can be answered from the inbox.");
  const operator = await getOperator(req);
  // The draft is replaced by what was actually sent.
  await prisma.outboundMessage.deleteMany({ where: { id: { in: message.replies.map((r) => r.id) } } });
  // Answered on the channel it came in on.
  const sent =
    message.channel === "WHATSAPP"
      ? await sendWhatsApp({ to: message.fromAddress, text: body, caseId: message.matchedCaseId, inReplyToId: message.id, automatic: false, approvedBy: operator })
      : await sendEmail({
          to: message.fromAddress,
          subject: `Re: ${message.subject ?? "your message"}`,
          text: body,
          caseId: message.matchedCaseId,
          inReplyToId: message.id,
          automatic: false,
          approvedBy: operator,
          threadId: message.externalId ?? undefined,
        });
  await prisma.inboundMessage.update({ where: { id: message.id }, data: { status: "REPLIED" } });
  if (message.matchedCaseId) {
    await prisma.caseEvent.create({
      data: {
        caseId: message.matchedCaseId,
        type: message.channel === "WHATSAPP" ? "WHATSAPP" : "EMAIL",
        title: `Reply to ${message.ref} sent${message.channel === "WHATSAPP" ? " on WhatsApp" : ""}`,
        body: body.slice(0, 500),
        actor: operator ? `operator:${operator}` : "operator",
      },
    });
  }
  return json({ reply: serialize(sent) });
});
