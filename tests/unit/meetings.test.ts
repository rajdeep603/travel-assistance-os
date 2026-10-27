import { describe, expect, it } from "vitest";
import { callDraft, callNextStep, defaultCallSlot, describeCallSlot } from "@/lib/calls";
import { GraphMeetings, MeetingProviderError, inviteHtml } from "@/lib/services/meetings";
import { utcToWallClock, wallClockToUtc } from "@/lib/time-zone";

// Teams calls: the clock arithmetic, the invite's wording, and exactly what
// goes to Microsoft Graph (with Graph itself faked).

const settings = { tenantId: "tenant-1", clientId: "client-1", clientSecret: "s3cret", organizer: "rajdeep.shah@sthiramservices.com" };

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** A Graph that answers from a script and remembers what it was sent. */
function fakeGraph(answer: (req: Sent) => { status?: number; body?: unknown }) {
  const sent: Sent[] = [];
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    const req = { url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: String(init?.body ?? "") };
    sent.push(req);
    if (req.url.includes("login.microsoftonline.com")) return Response.json({ access_token: "token-1", expires_in: 3600 });
    const { status = 200, body } = answer(req);
    return status === 202 || status === 204 ? new Response(null, { status }) : Response.json(body ?? {}, { status });
  }) as typeof fetch;
  return { sent, graph: new GraphMeetings(settings, fetcher) };
}

const slot = { startsAt: new Date("2026-11-03T09:00:00Z"), endsAt: new Date("2026-11-03T09:30:00Z") };

describe("clocks for a call", () => {
  it("turns a time on the customer's clock into the instant, and back", () => {
    expect(wallClockToUtc("2026-11-03", "11:00", "Europe/Istanbul").toISOString()).toBe("2026-11-03T08:00:00.000Z");
    expect(wallClockToUtc("2026-11-03", "09:00", "America/New_York").toISOString()).toBe("2026-11-03T14:00:00.000Z");
    expect(wallClockToUtc("2026-11-03", "15:30", "Asia/Kolkata").toISOString()).toBe("2026-11-03T10:00:00.000Z");
    expect(utcToWallClock(new Date("2026-11-03T23:30:00Z"), "Asia/Singapore")).toEqual({ date: "2026-11-04", time: "07:30" });
  });

  it("holds across a daylight-saving change", () => {
    // London: 25 Oct 2026 01:30 happens twice; the clocks went back that night.
    expect(wallClockToUtc("2026-10-24", "10:00", "Europe/London").toISOString()).toBe("2026-10-24T09:00:00.000Z");
    expect(wallClockToUtc("2026-10-26", "10:00", "Europe/London").toISOString()).toBe("2026-10-26T10:00:00.000Z");
    // New York, 8 Mar 2026: 02:30 doesn't exist and lands an hour on.
    expect(utcToWallClock(wallClockToUtc("2026-03-08", "02:30", "America/New_York"), "America/New_York").time).toBe("03:30");
  });

  it("refuses what isn't a day, a time or a zone", () => {
    for (const [date, time, zone] of [
      ["2026-02-30", "10:00", "Europe/London"],
      ["2026-11-03", "24:00", "Europe/London"],
      ["2026-11-03", "10:00", "Mars/Olympus"],
    ]) {
      expect(Number.isNaN(wallClockToUtc(date, time, zone).getTime()), `${date} ${time} ${zone}`).toBe(true);
    }
  });

  it("starts the picker on the next working day at ten", () => {
    // Friday evening in Istanbul → Monday.
    expect(defaultCallSlot("Europe/Istanbul", new Date("2026-10-30T18:00:00Z"))).toEqual({ date: "2026-11-02", time: "10:00" });
    // Tuesday → Wednesday.
    expect(defaultCallSlot("Europe/London", new Date("2026-11-03T08:00:00Z"))).toEqual({ date: "2026-11-04", time: "10:00" });
  });

  it("says when the call is on the customer's clock", () => {
    expect(describeCallSlot(slot.startsAt, slot.endsAt, "Europe/London")).toBe("Tue 3 Nov 2026, 09:00–09:30 London time");
    expect(describeCallSlot(slot.startsAt, slot.endsAt, "UTC")).toBe("Tue 3 Nov 2026, 09:00–09:30 UTC");
    expect(callNextStep(slot.startsAt, "Asia/Kolkata")).toBe("Teams call at 14:30 India time");
  });

  it("drafts the invite about the quotation, or a plain follow-up", () => {
    expect(callDraft({ customerName: "Aylin Kaya", quoteNumber: "Q-20261103-ABC123" })).toMatchObject({
      subject: "CareTrail: a call about quotation Q-20261103-ABC123",
      message: expect.stringContaining("Dear Aylin Kaya,"),
    });
    expect(callDraft({ customerName: "", quoteNumber: null }).subject).toBe("CareTrail: a follow-up call");
  });
});

describe("Microsoft Graph", () => {
  it("creates the call in the organiser's calendar with a Teams link, in UTC", async () => {
    const { sent, graph } = fakeGraph(() => ({
      status: 201,
      body: { id: "event-1", webLink: "https://outlook.office365.com/owa/?itemid=event-1", onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/abc" } },
    }));
    const made = await graph.create({
      ...slot,
      subject: "CareTrail: a call about quotation Q-1",
      text: "Dear Aylin,\n\nA call <about> the quotation & more.\nSee you then.",
      attendees: [{ email: "aylin@company.com", name: "Aylin Kaya" }, { email: "cfo@company.com" }],
      transactionId: "tx-1",
    });
    expect(made).toEqual({ id: "event-1", joinUrl: "https://teams.microsoft.com/l/meetup-join/abc", webLink: "https://outlook.office365.com/owa/?itemid=event-1" });

    const [token, create] = sent;
    expect(token.url).toBe("https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token");
    expect(token.body).toContain("grant_type=client_credentials");
    expect(token.body).toContain("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default");
    expect(create.method).toBe("POST");
    expect(create.url).toBe("https://graph.microsoft.com/v1.0/users/rajdeep.shah%40sthiramservices.com/events");
    expect(create.headers.authorization).toBe("Bearer token-1");
    expect(JSON.parse(create.body)).toEqual({
      subject: "CareTrail: a call about quotation Q-1",
      body: { contentType: "HTML", content: "<p>Dear Aylin,</p><p>A call &lt;about&gt; the quotation &amp; more.<br>See you then.</p>" },
      start: { dateTime: "2026-11-03T09:00:00.000", timeZone: "UTC" },
      end: { dateTime: "2026-11-03T09:30:00.000", timeZone: "UTC" },
      attendees: [
        { emailAddress: { address: "aylin@company.com", name: "Aylin Kaya" }, type: "required" },
        { emailAddress: { address: "cfo@company.com" }, type: "required" },
      ],
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      allowNewTimeProposals: true,
      isReminderOn: true,
      reminderMinutesBeforeStart: 15,
      transactionId: "tx-1",
    });
  });

  it("keeps the sign-in for the next call, and fetches a Teams link that came late", async () => {
    const { sent, graph } = fakeGraph((req) =>
      req.method === "POST" ? { status: 201, body: { id: "event-2", onlineMeeting: null } } : { body: { id: "event-2", onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/late" } } }
    );
    const first = await graph.create({ ...slot, subject: "s", text: "", attendees: [{ email: "a@company.com" }], transactionId: "tx-2" });
    await graph.create({ ...slot, subject: "s", text: "", attendees: [{ email: "a@company.com" }], transactionId: "tx-3" });
    expect(first.joinUrl).toBe("https://teams.microsoft.com/l/late");
    expect(sent.filter((r) => r.url.includes("login.microsoftonline.com"))).toHaveLength(1);
    expect(sent[2].url).toContain("/events/event-2?$select=id,webLink,onlineMeeting");
  });

  it("moves and cancels the call by its id; a call deleted in Outlook counts as cancelled", async () => {
    const { sent, graph } = fakeGraph((req) => {
      if (req.method === "PATCH") return { body: { id: "event-1", onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/abc" } } };
      if (req.url.includes("/events/gone/")) return { status: 404, body: { error: { code: "ErrorItemNotFound", message: "The specified object was not found in the store." } } };
      return { status: 202 };
    });
    await graph.reschedule("event-1", { startsAt: new Date("2026-11-04T09:00:00Z"), endsAt: new Date("2026-11-04T09:45:00Z") });
    const patch = sent.find((r) => r.method === "PATCH")!;
    expect(JSON.parse(patch.body)).toEqual({ start: { dateTime: "2026-11-04T09:00:00.000", timeZone: "UTC" }, end: { dateTime: "2026-11-04T09:45:00.000", timeZone: "UTC" } });

    expect(await graph.cancel("event-1", "Cancelled")).toBe(true);
    expect(sent.at(-1)).toMatchObject({ method: "POST", url: expect.stringMatching(/\/events\/event-1\/cancel$/) });
    expect(await graph.cancel("gone", "Cancelled")).toBe(false);
  });

  it("says plainly when Graph refuses", async () => {
    const { graph } = fakeGraph(() => ({ status: 403, body: { error: { code: "ErrorAccessDenied", message: "Access is denied." } } }));
    const err = await graph.create({ ...slot, subject: "s", text: "", attendees: [{ email: "a@company.com" }], transactionId: "tx" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MeetingProviderError);
    expect(err).toMatchObject({ status: 403, message: expect.stringContaining("Access is denied.") });
  });

  it("reads free and busy from the organiser's schedule, ignoring what only touches the slot", async () => {
    const answer = (items: unknown[]) => fakeGraph(() => ({ body: { value: [{ scheduleItems: items }] } })).graph;
    const before = { status: "busy", start: { dateTime: "2026-11-03T08:00:00.0000000" }, end: { dateTime: "2026-11-03T09:00:00.0000000" } };
    const overlap = { status: "tentative", start: { dateTime: "2026-11-03T09:15:00.0000000" }, end: { dateTime: "2026-11-03T10:00:00.0000000" } };
    const free = { status: "free", start: { dateTime: "2026-11-03T09:00:00.0000000" }, end: { dateTime: "2026-11-03T09:30:00.0000000" } };
    expect(await answer([before, free]).availability(slot)).toBe("free");
    expect(await answer([before, overlap]).availability(slot)).toBe("busy");
    expect(await fakeGraph(() => ({ body: { value: [] } })).graph.availability(slot)).toBe("unknown");
  });

  it("writes the invite's text as Outlook paragraphs", () => {
    expect(inviteHtml("One\n\n\nTwo\nlines")).toBe("<p>One</p><p>Two<br>lines</p>");
  });
});
