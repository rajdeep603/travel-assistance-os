import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ASSUMPTIONS, DEFAULT_COST_CONTAINMENT, DEFAULT_INPUTS, DEFAULT_RUNNING_COST_PRICES } from "@/lib/business-case";
import { cancelCall, callAvailability, listCalls, proposeCall, rescheduleCall, type ProposeCall } from "@/lib/services/lead-meetings";
import { createLead, deleteLead, followUpDraft, updateLead } from "@/lib/services/leads";
import { MeetingProviderError, MockMeetings, setMeetingService, type MeetingRequest, type MeetingService } from "@/lib/services/meetings";

// A Teams call proposed to a lead: one invite per time, never to a
// placeholder address; it sets the lead's next step (unless the presenter
// wrote their own), moves a new lead to contacted, and can be moved or
// cancelled. Microsoft 365 is faked.

const prisma = new PrismaClient();
const testStart = new Date();
// Monday 2 Nov 2026, 09:00 Istanbul: the calls below are later that week.
const now = new Date("2026-11-02T06:00:00Z");

class FakeMicrosoft implements MeetingService {
  readonly name = "graph";
  readonly configured = true;
  readonly organizer = "rajdeep.shah@sthiramservices.com";
  readonly created: MeetingRequest[] = [];
  readonly moved: string[] = [];
  readonly cancelled: string[] = [];
  gone = new Set<string>();
  async create(request: MeetingRequest) {
    this.created.push(request);
    const id = `event-${this.created.length}`;
    return { id, joinUrl: `https://teams.microsoft.com/l/meetup-join/${id}`, webLink: `https://outlook.office365.com/owa/?itemid=${id}` };
  }
  async reschedule(id: string) {
    if (this.gone.has(id)) throw new MeetingProviderError("Not found", 404);
    this.moved.push(id);
    return { id, joinUrl: null, webLink: null };
  }
  async cancel(id: string) {
    this.cancelled.push(id);
    return true;
  }
  async availability() {
    return "busy" as const;
  }
}

const input = {
  operation: DEFAULT_INPUTS,
  assumptions: DEFAULT_ASSUMPTIONS,
  prices: DEFAULT_RUNNING_COST_PRICES,
  costContainment: DEFAULT_COST_CONTAINMENT,
  quote: { customerName: "Aylin Kaya", companyName: "Calls Test Assistance", email: "aylin@calls-test.com", phone: "", services: [] },
};

const call = (change: Partial<ProposeCall> = {}): ProposeCall => ({
  date: "2026-11-04",
  time: "11:00",
  timeZone: "Europe/London",
  minutes: 30,
  attendees: ["aylin@calls-test.com", "cfo@calls-test.com"],
  subject: "CareTrail: a call about the quotation",
  message: "Dear Aylin,\n\nAs discussed.",
  ...change,
});

let leadId = "";
let microsoft: FakeMicrosoft;

beforeAll(async () => {
  leadId = (await createLead({ input, operator: "presenter" })).lead.id;
});

afterEach(() => setMeetingService(null));

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { createdAt: { gte: testStart }, companyName: "Calls Test Assistance" } });
  await prisma.$disconnect();
});

describe("Teams calls on a lead", () => {
  it("says plainly when the server has no Microsoft 365", async () => {
    setMeetingService(new MockMeetings());
    await expect(proposeCall(leadId, call(), "presenter", now)).rejects.toMatchObject({ status: 503 });
  });

  it("sends one invite from the organiser's calendar, sets the next step and marks the lead contacted", async () => {
    microsoft = new FakeMicrosoft();
    setMeetingService(microsoft);
    const { meeting, existing, lead } = await proposeCall(leadId, call(), "presenter", now);
    expect(existing).toBe(false);
    // 11:00 in London on 4 Nov is 11:00 UTC (GMT).
    expect(meeting).toMatchObject({
      startsAt: new Date("2026-11-04T11:00:00Z"),
      endsAt: new Date("2026-11-04T11:30:00Z"),
      timeZone: "Europe/London",
      attendees: ["aylin@calls-test.com", "cfo@calls-test.com"],
      organizer: "rajdeep.shah@sthiramservices.com",
      provider: "graph",
      providerEventId: "event-1",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/event-1",
      status: "SCHEDULED",
      createdBy: "presenter",
    });
    expect(microsoft.created[0]).toMatchObject({ subject: "CareTrail: a call about the quotation", attendees: [{ email: "aylin@calls-test.com", name: "Aylin Kaya" }, { email: "cfo@calls-test.com" }] });
    expect(lead).toMatchObject({ status: "CONTACTED", nextStep: "Teams call at 11:00 London time", nextStepOn: new Date("2026-11-04T00:00:00Z") });

    // A double click: the same call back, no second invite.
    const again = await proposeCall(leadId, call(), "presenter", now);
    expect(again).toMatchObject({ existing: true, meeting: { id: meeting.id } });
    expect(microsoft.created).toHaveLength(1);
  });

  it("puts the call and its link in the follow-up, once", async () => {
    setMeetingService(microsoft);
    const draft = await followUpDraft(leadId);
    expect(draft.text).toContain("Our Teams call: Wed 4 Nov 2026, 11:00–11:30 London time. The invite came separately, and this is the link to join: https://teams.microsoft.com/l/meetup-join/event-1.");
    expect(draft.text).not.toContain("Next step: Teams call");
  });

  it("never invites a placeholder address, a time gone by, or the organiser to their own call", async () => {
    setMeetingService(microsoft);
    await expect(proposeCall(leadId, call({ attendees: ["visitor@example.com"] }), null, now)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("placeholder") });
    await expect(proposeCall(leadId, call({ date: "2026-11-01" }), null, now)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("passed") });
    await expect(proposeCall(leadId, call({ attendees: ["rajdeep.shah@sthiramservices.com"] }), null, now)).rejects.toMatchObject({ status: 400 });
    expect(microsoft.created).toHaveLength(1);
  });

  it("moves the call, and the next step follows", async () => {
    setMeetingService(microsoft);
    const [booked] = await listCalls(leadId);
    const { meeting, lead } = await rescheduleCall(booked.id, { date: "2026-11-05", time: "15:00", timeZone: "Asia/Singapore", minutes: 45 }, now);
    expect(microsoft.moved).toEqual(["event-1"]);
    expect(meeting).toMatchObject({ startsAt: new Date("2026-11-05T07:00:00Z"), endsAt: new Date("2026-11-05T07:45:00Z"), timeZone: "Asia/Singapore", joinUrl: booked.joinUrl });
    expect(lead.nextStep).toBe("Teams call at 15:00 Singapore time");
  });

  it("cancels it for everyone, once, and clears the next step it wrote", async () => {
    setMeetingService(microsoft);
    const [booked] = await listCalls(leadId);
    const { meeting, lead } = await cancelCall(booked.id, now);
    expect(meeting.status).toBe("CANCELLED");
    expect(lead).toMatchObject({ nextStep: null, nextStepOn: null });
    await cancelCall(booked.id, now);
    expect(microsoft.cancelled).toEqual(["event-1"]);
    await expect(rescheduleCall(booked.id, { date: "2026-11-06", time: "10:00", timeZone: "Europe/London", minutes: 30 }, now)).rejects.toMatchObject({ status: 409 });
  });

  it("sends the lead's quotation in the same e-mail: the PDF attached to the invite, its summary under the text", async () => {
    setMeetingService(microsoft);
    const { meeting } = await proposeCall(leadId, call({ date: "2026-11-10", attachQuotation: true }), "presenter", now);
    expect(meeting.withQuotation).toBe(true);
    const request = microsoft.created.at(-1)!;
    expect(request.attachments).toHaveLength(1);
    expect(request.attachments![0]).toMatchObject({ type: "application/pdf", filename: expect.stringMatching(/^sthiram-caretrail-quotation-Q-\d{8}-[0-9A-F]{6}\.pdf$/) });
    expect(request.attachments![0].content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(request.text).toMatch(/^Dear Aylin,\n\nAs discussed\.\n\n.*Prepared for Aylin Kaya, Calls Test Assistance/s);
    // Without it, no file and the text as typed.
    expect(microsoft.created[0].attachments).toBeUndefined();
    expect(microsoft.created[0].text).toBe("Dear Aylin,\n\nAs discussed.");
  });

  it("can't attach a quotation the lead doesn't have", async () => {
    setMeetingService(microsoft);
    const visitor = await prisma.lead.create({
      data: { ref: `LEAD-T${Date.now()}`, quoteNumber: "", customerName: "Visitor", companyName: "Calls Test Assistance", email: "v@calls-test.com", input: input as never, oneTimeTotal: 0, monthlyCost: 0, firstYearCost: 0, netAnnualSaving: 0, source: "VISITOR" },
    });
    await expect(proposeCall(visitor.id, call({ attendees: ["v@calls-test.com"], attachQuotation: true }), null, now)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("no quotation") });
  });

  it("leaves a next step the presenter wrote alone", async () => {
    setMeetingService(microsoft);
    await updateLead(leadId, { nextStep: "Send the DPA to legal", nextStepOn: null });
    const { lead } = await proposeCall(leadId, call({ date: "2026-11-06" }), "presenter", now);
    expect(lead.nextStep).toBe("Send the DPA to legal");
  });

  it("marks a call deleted in Outlook as cancelled when it is moved", async () => {
    setMeetingService(microsoft);
    const booked = (await listCalls(leadId)).find((m) => m.status === "SCHEDULED")!;
    microsoft.gone.add(booked.providerEventId);
    await expect(rescheduleCall(booked.id, { date: "2026-11-09", time: "10:00", timeZone: "Europe/London", minutes: 30 }, now)).rejects.toMatchObject({ status: 409 });
    expect((await prisma.leadMeeting.findUniqueOrThrow({ where: { id: booked.id } })).status).toBe("CANCELLED");
  });

  it("checks the organiser's calendar, and never fails over it", async () => {
    setMeetingService(microsoft);
    expect(await callAvailability({ date: "2026-11-04", time: "11:00", timeZone: "Europe/London", minutes: 30 }, now)).toBe("busy");
    setMeetingService(new MockMeetings());
    expect(await callAvailability({ date: "2026-11-04", time: "11:00", timeZone: "Europe/London", minutes: 30 }, now)).toBe("unknown");
  });

  it("goes with the lead when the lead is deleted", async () => {
    await deleteLead(leadId);
    expect(await prisma.leadMeeting.count({ where: { leadId } })).toBe(0);
  });
});
