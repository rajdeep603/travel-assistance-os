import twilio from "twilio";

// ---------------------------------------------------------------------------
// TelephonyService: everything the platform asks of a phone network. Twilio
// implements it; the mock keeps development and tests offline. Swapping
// carriers (Vonage, Telnyx, a SIP trunk) means writing one new class.
// ---------------------------------------------------------------------------

export interface PlaceCallInput {
  to: string;
  /** TwiML webhook Twilio fetches when the call connects. */
  url: string;
  statusCallback: string;
  /** Answering-machine detection result posted here (async AMD). */
  amdCallback?: string;
}

export interface TransferInput {
  callSid: string;
  number: string;
  /** TwiML the person hears before being connected (the AI summary). */
  whisperUrl: string;
  /** Where Twilio reports whether the transfer was answered. */
  actionUrl: string;
  /** Spoken to the caller while connecting. */
  announcement: string;
}

export interface TelephonyService {
  readonly name: string;
  readonly configured: boolean;
  /** The platform's own phone number (caller ID). */
  readonly fromNumber: string | null;
  validateSignature(signature: string | null, url: string, params: Record<string, string>): boolean;
  placeCall(input: PlaceCallInput): Promise<{ sid: string }>;
  transfer(input: TransferInput): Promise<void>;
  /** Replaces whatever a live call is doing with new TwiML. */
  redirect(callSid: string, twiml: string): Promise<void>;
  hangup(callSid: string): Promise<void>;
  sendSms(to: string, body: string): Promise<{ sid: string }>;
  /** A WhatsApp message from the business sender (TWILIO_WHATSAPP_FROM); throws when none is set. */
  sendWhatsApp(to: string, body: string): Promise<{ sid: string }>;
  /** Downloads a media file Twilio received (WhatsApp photos and PDFs need the account's credentials). */
  fetchMedia(url: string): Promise<Buffer>;
}

/** "whatsapp:+44…" ↔ "+44…". */
export const whatsappAddress = (phone: string) => (phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`);
export const fromWhatsapp = (address: string) => address.replace(/^whatsapp:/, "");

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A transfer target that is a SIP address ("sip:overflow@acme.byoc.example"):
 * a contact centre's queue (Genesys Cloud BYOC, Avaya, Cisco, a PBX) rather
 * than a phone number.
 */
export const isSipTarget = (target: string) => /^sips?:/i.test(target.trim());

/** TwiML that warm-transfers a live call: announce, then dial (a number or a SIP address) with a whisper. */
export function transferTwiml(input: Omit<TransferInput, "callSid">, callerId: string | null): string {
  const target = isSipTarget(input.number)
    ? `<Sip url="${escapeXml(input.whisperUrl)}">${escapeXml(input.number.trim())}</Sip>`
    : `<Number url="${escapeXml(input.whisperUrl)}">${escapeXml(input.number)}</Number>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Say voice="Polly.Joanna">${escapeXml(input.announcement)}</Say>` +
    `<Dial timeout="25" action="${escapeXml(input.actionUrl)}"${callerId ? ` callerId="${escapeXml(callerId)}"` : ""}>` +
    target +
    `</Dial></Response>`
  );
}

/**
 * The caller's number from a webhook's From: "+44…" as is; from a SIP call
 * ("sip:+447700900101@carrier.example;user=phone"), the number in the user part
 * when there is one, else the SIP address itself.
 */
export function callerNumber(from: string | null | undefined): string | null {
  if (!from) return null;
  const m = from.match(/^sips?:([^@;]+)@/i);
  if (!m) return from;
  const user = decodeURIComponent(m[1]);
  return /^\+?\d{6,15}$/.test(user) ? (user.startsWith("+") ? user : `+${user}`) : from;
}

/** TwiML that says a last message and ends the call. */
export function sayAndHangupTwiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(message)}</Say><Hangup/></Response>`;
}

class TwilioTelephony implements TelephonyService {
  readonly name = "twilio";
  readonly configured = true;
  private client: ReturnType<typeof twilio>;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    readonly fromNumber: string | null
  ) {
    this.client = twilio(accountSid, authToken);
  }

  validateSignature(signature: string | null, url: string, params: Record<string, string>): boolean {
    if (!signature) return false;
    return twilio.validateRequest(this.authToken, signature, url, params);
  }

  async placeCall(input: PlaceCallInput) {
    if (!this.fromNumber) throw new Error("TWILIO_PHONE_NUMBER is not set");
    const call = await this.client.calls.create({
      to: input.to,
      from: this.fromNumber,
      url: input.url,
      statusCallback: input.statusCallback,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      ...(input.amdCallback
        ? {
            machineDetection: "DetectMessageEnd",
            asyncAmd: "true",
            asyncAmdStatusCallback: input.amdCallback,
          }
        : {}),
    });
    return { sid: call.sid };
  }

  async transfer(input: TransferInput) {
    await this.redirect(input.callSid, transferTwiml(input, this.fromNumber));
  }

  async redirect(callSid: string, twiml: string) {
    await this.client.calls(callSid).update({ twiml });
  }

  async hangup(callSid: string) {
    await this.client.calls(callSid).update({ status: "completed" });
  }

  async sendSms(to: string, body: string) {
    if (!this.fromNumber) throw new Error("TWILIO_PHONE_NUMBER is not set");
    const msg = await this.client.messages.create({ to, from: this.fromNumber, body });
    return { sid: msg.sid };
  }

  async sendWhatsApp(to: string, body: string) {
    const from = process.env.TWILIO_WHATSAPP_FROM;
    if (!from) throw new Error("TWILIO_WHATSAPP_FROM is not set");
    const msg = await this.client.messages.create({ to: whatsappAddress(to), from: whatsappAddress(from), body });
    return { sid: msg.sid };
  }

  async fetchMedia(url: string) {
    const res = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}` } });
    if (!res.ok) throw new Error(`Media download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Offline stand-in: records what would have happened. */
export class MockTelephony implements TelephonyService {
  readonly name = "mock";
  readonly configured = false;
  readonly fromNumber = null;
  readonly log: { action: string; detail: unknown }[] = [];

  validateSignature(): boolean {
    return false; // never accept "Twilio" webhooks without a real auth token
  }
  async placeCall(input: PlaceCallInput) {
    this.log.push({ action: "placeCall", detail: input });
    return { sid: `CA_mock_${this.log.length}` };
  }
  async transfer(input: TransferInput) {
    this.log.push({ action: "transfer", detail: input });
  }
  async redirect(callSid: string, twiml: string) {
    this.log.push({ action: "redirect", detail: { callSid, twiml } });
  }
  async hangup(callSid: string) {
    this.log.push({ action: "hangup", detail: callSid });
  }
  async sendSms(to: string, body: string) {
    this.log.push({ action: "sendSms", detail: { to, body } });
    return { sid: `SM_mock_${this.log.length}` };
  }
  async sendWhatsApp(to: string, body: string) {
    this.log.push({ action: "sendWhatsApp", detail: { to, body } });
    return { sid: `WA_mock_${this.log.length}` };
  }
  async fetchMedia(): Promise<Buffer> {
    throw new Error("Telephony is not configured.");
  }
}

let instance: TelephonyService | null = null;

export function getTelephony(): TelephonyService {
  if (!instance) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    instance =
      sid && token ? new TwilioTelephony(sid, token, process.env.TWILIO_PHONE_NUMBER || null) : new MockTelephony();
  }
  return instance;
}

/** Test hook. */
export function setTelephony(service: TelephonyService | null): void {
  instance = service;
}
