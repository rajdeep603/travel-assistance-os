import { createTransport, type Transporter } from "nodemailer";
import { BRAND } from "@/lib/brand";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// EmailService: outbound e-mail. Amazon SES over SMTP when SES_SMTP_* is set,
// else Twilio SendGrid (v3 Mail Send) when SENDGRID_API_KEY is set; otherwise
// the mock records messages in the outbox so the whole flow still runs
// offline. One class per provider.
//
// A real provider never receives the demo's fictional addresses (the reserved
// example domains): those stay simulated, so the seeded hospitals, vendors
// and travellers never bounce against the sending reputation.
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
  /** Where replies should go, when not to the sender. */
  replyTo?: string;
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

/** RFC 2606 and 6761 names: the demo's fictional people and hospitals use these. */
const RESERVED_DOMAIN = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost)$/i;

/** True for an address no real mailbox can have (aylin@demo-heart.example, x@example.com). */
export function isReservedAddress(address: string): boolean {
  const domain = emailAddress(address).split("@")[1] ?? "";
  return !domain || RESERVED_DOMAIN.test(domain);
}

/**
 * SES's id for the message, from its SMTP acceptance line ("250 Ok 0109019a…"):
 * the id its bounce and complaint reports use. Null for any other relay.
 */
export function parseSesMessageId(response: string | undefined): string | null {
  const match = /^250 Ok ([0-9a-z-]+)$/i.exec((response ?? "").trim());
  return match ? match[1] : null;
}

class SesSmtpEmail implements EmailService {
  readonly name = "ses";
  readonly configured = true;
  private readonly transporter: Transporter;

  constructor(private readonly settings: NonNullable<typeof env.sesSmtp>) {
    this.transporter = createTransport({
      host: settings.host,
      port: settings.port,
      // 465 is implicit TLS; 587 and 2587 use STARTTLS.
      secure: settings.port === 465,
      auth: { user: settings.user, pass: settings.password },
      tls: { rejectUnauthorized: true },
      // Someone is waiting on the screen: fail in seconds, not minutes.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  }

  async send(message: EmailMessage) {
    const info = await this.transporter.sendMail({
      from: { name: this.settings.fromName || BRAND.name, address: this.settings.from },
      to: emailAddress(message.to),
      subject: message.subject,
      text: message.text,
      ...(message.inReplyTo ? { inReplyTo: message.inReplyTo, references: message.inReplyTo } : {}),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.type })),
    });
    if (info.rejected?.length) throw new Error(`SES refused the recipient ${emailAddress(message.to)}`);
    return { id: parseSesMessageId(info.response) ?? info.messageId };
  }
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
        from: { email: emailAddress(env.emailFrom), name: `${BRAND.name} (demo)` },
        subject: message.subject,
        ...(message.replyTo ? { reply_to: { email: emailAddress(message.replyTo) } } : {}),
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
const simulated = new MockEmail();

export function getEmailService(): EmailService {
  if (!instance) {
    const ses = env.sesSmtp;
    instance = ses ? new SesSmtpEmail(ses) : env.sendgridApiKey ? new SendGridEmail(env.sendgridApiKey) : new MockEmail();
  }
  return instance;
}

/** The service for one recipient: with a real provider, fictional addresses stay simulated. */
export function emailServiceFor(to: string): EmailService {
  const service = getEmailService();
  return service.configured && isReservedAddress(to) ? simulated : service;
}

/** Test hook. */
export function setEmailService(service: EmailService | null): void {
  instance = service;
}
