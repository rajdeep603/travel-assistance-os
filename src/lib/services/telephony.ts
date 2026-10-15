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
  hangup(callSid: string): Promise<void>;
  sendSms(to: string, body: string): Promise<{ sid: string }>;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** TwiML that warm-transfers a live call: announce, then dial with a whisper. */
export function transferTwiml(input: Omit<TransferInput, "callSid">, callerId: string | null): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Say voice="Polly.Joanna">${escapeXml(input.announcement)}</Say>` +
    `<Dial timeout="25" action="${escapeXml(input.actionUrl)}"${callerId ? ` callerId="${escapeXml(callerId)}"` : ""}>` +
    `<Number url="${escapeXml(input.whisperUrl)}">${escapeXml(input.number)}</Number>` +
    `</Dial></Response>`
  );
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
    await this.client.calls(input.callSid).update({ twiml: transferTwiml(input, this.fromNumber) });
  }

  async hangup(callSid: string) {
    await this.client.calls(callSid).update({ status: "completed" });
  }

  async sendSms(to: string, body: string) {
    if (!this.fromNumber) throw new Error("TWILIO_PHONE_NUMBER is not set");
    const msg = await this.client.messages.create({ to, from: this.fromNumber, body });
    return { sid: msg.sid };
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
  async hangup(callSid: string) {
    this.log.push({ action: "hangup", detail: callSid });
  }
  async sendSms(to: string, body: string) {
    this.log.push({ action: "sendSms", detail: { to, body } });
    return { sid: `SM_mock_${this.log.length}` };
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
