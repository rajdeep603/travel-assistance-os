import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// EmailService: outbound e-mail. Twilio SendGrid (v3 Mail Send) when
// SENDGRID_API_KEY is set; otherwise the mock records messages in the outbox
// so the whole flow still runs offline. One class per provider.
// ---------------------------------------------------------------------------

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  type: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
  /** Threading: the Message-ID being replied to. */
  inReplyTo?: string;
}

export interface EmailService {
  readonly name: string;
  readonly configured: boolean;
  send(message: EmailMessage): Promise<{ id: string }>;
}

/** "Aylin Yilmaz <aylin@example.com>" → "aylin@example.com" */
export function emailAddress(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
}

class SendGridEmail implements EmailService {
  readonly name = "sendgrid";
  readonly configured = true;

  constructor(private readonly apiKey: string) {}

  async send(message: EmailMessage) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: emailAddress(message.to) }] }],
        from: { email: emailAddress(env.emailFrom), name: "Travel Assistance (demo)" },
        subject: message.subject,
        content: [{ type: "text/plain", value: message.text }],
        ...(message.inReplyTo ? { headers: { "In-Reply-To": message.inReplyTo, References: message.inReplyTo } } : {}),
        ...(message.attachments?.length
          ? {
              attachments: message.attachments.map((a) => ({
                content: a.content.toString("base64"),
                filename: a.filename,
                type: a.type,
                disposition: "attachment",
              })),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`SendGrid rejected the message (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return { id: res.headers.get("x-message-id") ?? `sg_${Date.now()}` };
  }
}

export class MockEmail implements EmailService {
  readonly name = "mock";
  readonly configured = false;
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.sent.push(message);
    return { id: `mock_email_${this.sent.length}` };
  }
}

let instance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!instance) instance = env.sendgridApiKey ? new SendGridEmail(env.sendgridApiKey) : new MockEmail();
  return instance;
}

/** Test hook. */
export function setEmailService(service: EmailService | null): void {
  instance = service;
}
