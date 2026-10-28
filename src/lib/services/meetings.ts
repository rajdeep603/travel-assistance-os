import { signedHtml } from "@/lib/email-signature";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// MeetingService: Teams calls in the organiser's Microsoft 365 calendar.
// Microsoft Graph when MS_* is set: the app creates the event in the
// organiser's calendar with a Teams link, and Exchange sends the invite (and
// later the update or the cancellation) from that mailbox, so the reply lands
// in a real inbox. Otherwise the mock records the calls, and the quotation
// doesn't offer one. One class per provider, as in email.ts.
// ---------------------------------------------------------------------------

export interface MeetingAttendee {
  email: string;
  name?: string;
}

export interface MeetingAttachment {
  filename: string;
  content: Buffer;
  type: string;
}

export interface MeetingRequest {
  subject: string;
  /** The invite's text, as typed; Teams adds its join block below it. */
  text: string;
  /** The quotation's summary, set below the text in a box of its own. */
  summary?: string;
  startsAt: Date;
  endsAt: Date;
  attendees: MeetingAttendee[];
  /** Files that go with the invite (the quotation's PDF), each under 3 MB. */
  attachments?: MeetingAttachment[];
  /** The same id twice means a retry of the same invite, never a second one. */
  transactionId: string;
}

export interface ScheduledMeeting {
  /** The provider's id for the event, used to move or cancel it. */
  id: string;
  joinUrl: string | null;
  /** The event in the organiser's Outlook on the web. */
  webLink: string | null;
}

/** The organiser's calendar over a period: free, busy (or tentative or away), or not known. */
export type Availability = "free" | "busy" | "unknown";

export interface MeetingService {
  readonly name: string;
  readonly configured: boolean;
  /** The mailbox the invites come from. */
  readonly organizer: string | null;
  create(request: MeetingRequest): Promise<ScheduledMeeting>;
  reschedule(id: string, slot: { startsAt: Date; endsAt: Date }): Promise<ScheduledMeeting>;
  /** Cancels the call for everyone invited; false when it was no longer in the calendar. */
  cancel(id: string, comment: string): Promise<boolean>;
  availability(slot: { startsAt: Date; endsAt: Date }): Promise<Availability>;
}

/** Graph said no; `status` is Graph's HTTP status (404: the event is gone). */
export class MeetingProviderError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "MeetingProviderError";
  }
}

const GRAPH = "https://graph.microsoft.com/v1.0";

/** Graph's dateTimeTimeZone, always in UTC: every invitee's calendar shows it in their own clock. */
const utc = (d: Date) => ({ dateTime: d.toISOString().replace(/Z$/, ""), timeZone: "UTC" });

/** Graph's "2026-11-03T09:00:00.0000000" (UTC, as asked for) → epoch ms; NaN if unreadable. */
const graphUtc = (s: string | undefined) => Date.parse(`${(s ?? "").replace(/(\.\d{3})\d+$/, "$1")}Z`);

interface GraphEvent {
  id: string;
  webLink?: string | null;
  onlineMeeting?: { joinUrl?: string | null } | null;
}

export class GraphMeetings implements MeetingService {
  readonly name = "graph";
  readonly configured = true;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly settings: NonNullable<typeof env.microsoftMeetings>,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  get organizer() {
    return this.settings.organizer;
  }

  /** An app-only token (client credentials), kept until a minute before it expires. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const res = await this.fetcher(`https://login.microsoftonline.com/${encodeURIComponent(this.settings.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.settings.clientId,
        client_secret: this.settings.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !body.access_token) {
      throw new MeetingProviderError(`Microsoft sign-in failed (${res.status}): ${(body.error_description ?? "").split("\r\n")[0].slice(0, 200)}`, res.status);
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + Math.max(0, (body.expires_in ?? 3600) - 60) * 1000 };
    return this.token.value;
  }

  private async graph<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const res = await this.fetcher(`${GRAPH}/users/${encodeURIComponent(this.settings.organizer)}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await this.accessToken()}`,
        "content-type": "application/json",
        prefer: 'outlook.timezone="UTC"',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      // Someone is waiting on the screen: fail in seconds, not minutes.
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "";
      throw new MeetingProviderError(`Microsoft Graph refused ${method} ${path.split("?")[0]} (${res.status}): ${detail.slice(0, 200)}`, res.status);
    }
    return res.status === 202 || res.status === 204 ? null : ((await res.json()) as T);
  }

  private async scheduled(event: GraphEvent): Promise<ScheduledMeeting> {
    let joinUrl = event.onlineMeeting?.joinUrl ?? null;
    // The Teams link is usually there at once; if not, it is a moment later.
    if (!joinUrl) {
      const again = await this.graph<GraphEvent>("GET", `/events/${encodeURIComponent(event.id)}?$select=id,webLink,onlineMeeting`);
      joinUrl = again?.onlineMeeting?.joinUrl ?? null;
    }
    return { id: event.id, joinUrl, webLink: event.webLink ?? null };
  }

  async create(request: MeetingRequest): Promise<ScheduledMeeting> {
    const attendees = request.attendees.map((a) => ({ emailAddress: { address: a.email, ...(a.name ? { name: a.name } : {}) }, type: "required" }));
    const files = request.attachments ?? [];
    const event = await this.graph<GraphEvent>("POST", "/events", {
      subject: request.subject,
      // Sthiram's signature closes the text; Teams adds the link to join below it.
      body: { contentType: "HTML", content: signedHtml(request.text, request.summary) },
      start: utc(request.startsAt),
      end: utc(request.endsAt),
      // Exchange sends the invite the moment there are attendees, and a file
      // added after that never reaches them: with files, the attendees come last.
      ...(files.length ? {} : { attendees }),
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      allowNewTimeProposals: true,
      isReminderOn: true,
      reminderMinutesBeforeStart: 15,
      transactionId: request.transactionId,
    });
    if (!files.length) return this.scheduled(event!);

    const path = `/events/${encodeURIComponent(event!.id)}`;
    try {
      for (const file of files) {
        await this.graph("POST", `${path}/attachments`, {
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: file.filename,
          contentType: file.type,
          contentBytes: file.content.toString("base64"),
        });
      }
      const sent = await this.graph<GraphEvent>("PATCH", path, { attendees });
      return this.scheduled({ ...event!, ...sent });
    } catch (err) {
      // Nobody was invited yet: take the half-made event out of the calendar.
      await this.graph("DELETE", path).catch(() => undefined);
      throw err;
    }
  }

  async reschedule(id: string, slot: { startsAt: Date; endsAt: Date }): Promise<ScheduledMeeting> {
    const event = await this.graph<GraphEvent>("PATCH", `/events/${encodeURIComponent(id)}`, { start: utc(slot.startsAt), end: utc(slot.endsAt) });
    return this.scheduled(event!);
  }

  async cancel(id: string, comment: string): Promise<boolean> {
    try {
      await this.graph("POST", `/events/${encodeURIComponent(id)}/cancel`, { comment });
      return true;
    } catch (err) {
      // Deleted in Outlook already: nothing left to cancel.
      if (err instanceof MeetingProviderError && err.status === 404) return false;
      throw err;
    }
  }

  async availability(slot: { startsAt: Date; endsAt: Date }): Promise<Availability> {
    const res = await this.graph<{ value?: { scheduleItems?: { status?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }[] }[] }>(
      "POST",
      "/calendar/getSchedule",
      { schedules: [this.settings.organizer], startTime: utc(slot.startsAt), endTime: utc(slot.endsAt), availabilityViewInterval: 15 }
    );
    const items = res?.value?.[0]?.scheduleItems;
    if (!items) return "unknown";
    const start = slot.startsAt.getTime();
    const end = slot.endsAt.getTime();
    const clash = items.some((item) => {
      if (!item.status || item.status === "free" || item.status === "workingElsewhere") return false;
      const from = graphUtc(item.start?.dateTime);
      const to = graphUtc(item.end?.dateTime);
      // getSchedule can return items that only touch the edges of the slot.
      return !(Number.isFinite(from) && Number.isFinite(to)) || (from < end && to > start);
    });
    return clash ? "busy" : "free";
  }
}

export class MockMeetings implements MeetingService {
  readonly name = "mock";
  readonly configured = false;
  readonly organizer = null;
  readonly created: (MeetingRequest & { id: string })[] = [];

  async create(request: MeetingRequest) {
    const same = this.created.find((m) => m.transactionId === request.transactionId);
    if (same) return { id: same.id, joinUrl: null, webLink: null };
    const id = `mock_meeting_${this.created.length + 1}`;
    this.created.push({ ...request, id });
    return { id, joinUrl: null, webLink: null };
  }

  async reschedule(id: string) {
    return { id, joinUrl: null, webLink: null };
  }

  async cancel() {
    return true;
  }

  async availability(): Promise<Availability> {
    return "unknown";
  }
}

let instance: MeetingService | null = null;

export function getMeetingService(): MeetingService {
  if (!instance) {
    const ms = env.microsoftMeetings;
    instance = ms ? new GraphMeetings(ms) : new MockMeetings();
  }
  return instance;
}

/** Test hook. */
export function setMeetingService(service: MeetingService | null): void {
  instance = service;
}
