const DEFAULT_MAX_UPLOAD_MB = 10;

export const env = {
  get databaseUrl(): string {
    return process.env.DATABASE_URL ?? "";
  },
  get aiApiKey(): string {
    return process.env.AI_API_KEY ?? "";
  },
  get aiModel(): string {
    return process.env.AI_MODEL || "claude-opus-5-5";
  },
  get appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  },
  get uploadDir(): string {
    return process.env.UPLOAD_DIR || "./uploads";
  },
  /** xAI key for Grok Voice (voice agents). Empty = voice features unavailable. */
  get xaiApiKey(): string {
    return process.env.XAI_API_KEY ?? "";
  },
  /** Pinned so xAI's "-latest" auto-migration can't change behaviour mid-event. */
  get xaiVoiceModel(): string {
    return process.env.XAI_VOICE_MODEL || "grok-voice-3.0";
  },
  get xaiRealtimeUrl(): string {
    return process.env.XAI_REALTIME_URL || "wss://api.x.ai/v1/realtime";
  },
  /**
   * Where browsers reach the voice gateway. Empty = same origin under /ws
   * (production, behind nginx); in development e.g. ws://localhost:8080.
   */
  get voiceGatewayPublicUrl(): string {
    return process.env.VOICE_GATEWAY_PUBLIC_URL ?? "";
  },
  /** Externally reachable https:// base URL (Twilio webhooks are signed against it). */
  get publicBaseUrl(): string {
    return (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  },
  get twilioPhoneNumber(): string {
    return process.env.TWILIO_PHONE_NUMBER ?? "";
  },
  /** Who emergencies are warm-transferred to (E.164). */
  get onCallDoctorNumber(): string {
    return process.env.ON_CALL_DOCTOR_NUMBER ?? "";
  },
  get caseManagerNumber(): string {
    return process.env.CASE_MANAGER_NUMBER ?? "";
  },
  /** Agent profile that answers the hotline number. */
  get hotlineAgent(): string {
    return process.env.HOTLINE_AGENT || "inbound-hotline";
  },
  /** Cap on simultaneous AI phone calls (cost and capacity guard). */
  get maxConcurrentCalls(): number {
    const n = Number(process.env.MAX_CONCURRENT_CALLS);
    return Number.isFinite(n) && n > 0 ? n : 5;
  },
  /** E.164 numbers outbound AI calls may dial (toll-fraud and demo-safety allowlist). */
  get outboundAllowedNumbers(): string[] {
    return (process.env.OUTBOUND_ALLOWED_NUMBERS ?? "")
      .split(",")
      .map((n) => n.replace(/[^\d+]/g, ""))
      .filter((n) => /^\+\d{8,15}$/.test(n));
  },
  /** Minutes before an unanswered outbound call is retried (once). */
  get outboundRetryMinutes(): number {
    const n = Number(process.env.OUTBOUND_RETRY_MINUTES);
    return Number.isFinite(n) && n > 0 ? n : 30;
  },
  /** How the app reaches the gateway inside the stack (AMD notifications). */
  /** Where the voice gateway reaches the app for work it can't do itself (rendering PDFs). Empty = in-process. */
  get appInternalUrl(): string {
    return (process.env.APP_INTERNAL_URL ?? "").replace(/\/$/, "");
  },
  get voiceGatewayInternalUrl(): string {
    return (process.env.VOICE_GATEWAY_INTERNAL_URL || "http://voice-gateway:8080").replace(/\/$/, "");
  },
  get sendgridApiKey(): string {
    return process.env.SENDGRID_API_KEY ?? "";
  },
  /**
   * Amazon SES over SMTP, set up as in CareTrack. The user and password are SES
   * SMTP credentials, not an IAM key pair; the region is in the host. All five
   * must be set, or SES stays off.
   */
  get sesSmtp(): { host: string; port: number; user: string; password: string; from: string; fromName: string } | null {
    const host = process.env.SES_SMTP_HOST ?? "";
    const port = Number(process.env.SES_SMTP_PORT ?? "");
    const user = process.env.SES_SMTP_USER ?? "";
    const password = process.env.SES_SMTP_PASSWORD ?? "";
    const from = process.env.SES_MAIL_FROM ?? "";
    if (!host || !port || !user || !password || !from) return null;
    return { host, port, user, password, from, fromName: process.env.SES_MAIL_FROM_NAME || "" };
  },
  /**
   * Where a visitor's reply to a meeting follow-up goes (a presenter's own
   * mailbox), since the sender address doesn't take mail. Empty: no Reply-To.
   */
  get followUpReplyTo(): string {
    return (process.env.FOLLOW_UP_REPLY_TO ?? "").trim();
  },
  /** Sender for e-mail replies and Letters of Guarantee. */
  get emailFrom(): string {
    return process.env.EMAIL_FROM || "claims@demo-assistance.example";
  },
  /** Shared secret in the inbound e-mail/fax webhook paths. */
  get inboundEmailSecret(): string {
    return process.env.INBOUND_EMAIL_SECRET ?? "";
  },
  get inboundFaxSecret(): string {
    return process.env.INBOUND_FAX_SECRET ?? "";
  },
  /** Letters of Guarantee up to this amount (EUR) are approved without a human. */
  get logAutoApproveLimitEur(): number {
    const n = Number(process.env.LOG_AUTO_APPROVE_LIMIT);
    return Number.isFinite(n) && n >= 0 ? n : 10000;
  },
  /** Days a Letter of Guarantee stays valid. */
  get logValidDays(): number {
    const n = Number(process.env.LOG_VALID_DAYS);
    return Number.isFinite(n) && n > 0 ? n : 7;
  },
  /** Days phone transcripts of real callers are kept before being purged. */
  get callRetentionDays(): number {
    const n = Number(process.env.CALL_DATA_RETENTION_DAYS);
    return Number.isFinite(n) && n > 0 ? n : 30;
  },
  get maxUploadBytes(): number {
    const mb = Number(process.env.MAX_UPLOAD_MB);
    return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024;
  },
};
