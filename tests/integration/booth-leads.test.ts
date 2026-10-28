import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { resetAIService } from "@/lib/services/ai";
import { AnthropicAIService } from "@/lib/services/ai/anthropic";
import { CardLeadSchema, readBusinessCard, saveCardLead } from "@/lib/services/business-cards";
import { MockEmail, setEmailService } from "@/lib/services/email";
import { LeadUpdateSchema, createVisitorLead, getLead, updateLead } from "@/lib/services/leads";
import { importMeetings } from "@/lib/services/meeting-import";
import { MockMeetings, setMeetingService } from "@/lib/services/meetings";

// The booth's new ways in: a business card read by the model and checked by
// the presenter, and the meetings booked for the show imported from a CSV
// with a brief each. Neither is consent to e-mail, and neither duplicates a
// lead that's already there. The model is mocked; nothing is sent.

const prisma = new PrismaClient();
const testStart = new Date();
const originalKey = process.env.AI_API_KEY;

// Only the bytes' signature matters to the upload check; the model is mocked.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF fictional card photo")]);

function useModel(key: string) {
  process.env.AI_API_KEY = key;
  resetAIService();
}

async function postCard(file: File) {
  const { POST } = await import("@/app/api/leads/card/route");
  const form = new FormData();
  form.append("file", file);
  return POST(new Request("http://app/api/leads/card", { method: "POST", body: form }), {});
}

async function postImport(csv: string) {
  const { POST } = await import("@/app/api/leads/import/route");
  const form = new FormData();
  form.append("file", new File([csv], "meetings.csv", { type: "text/csv" }));
  return POST(new Request("http://app/api/leads/import", { method: "POST", body: form }), {});
}

const leadsByEmail = (email: string) => prisma.lead.findMany({ where: { email: { equals: email, mode: "insensitive" } } });

beforeAll(() => {
  setEmailService(new MockEmail());
  setMeetingService(new MockMeetings());
});

afterEach(() => {
  vi.restoreAllMocks();
  useModel(originalKey ?? "");
});

afterAll(async () => {
  setEmailService(null);
  setMeetingService(null);
  await prisma.lead.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.$disconnect();
});

describe("reading a business card", () => {
  it("turns the model's reading into a tidy draft", async () => {
    useModel("sk-test-not-used");
    const read = vi.spyOn(AnthropicAIService.prototype, "readBusinessCard").mockResolvedValue({
      name: "  Ana   Example ",
      company: "Example Assistance Ltd",
      jobTitle: "Head of operations",
      email: "mailto:Ana.Example@EXAMPLE.COM",
      phone: "+44 20 7946 0000",
      website: "www.example.com",
    });
    const reading = await readBusinessCard({ buffer: JPEG, filename: "card.jpg" });
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ mimeType: "image/jpeg" }));
    expect(reading).toEqual({
      source: "claude",
      note: null,
      draft: { name: "Ana Example", company: "Example Assistance Ltd", role: "Head of operations", email: "ana.example@example.com", phone: "+44 20 7946 0000", website: "www.example.com" },
    });
  });

  it("gives an empty draft and a note without a live model, or when it fails", async () => {
    useModel("");
    const offline = await readBusinessCard({ buffer: JPEG, filename: "card.jpg" });
    expect(offline.source).toBe("offline");
    expect(Object.values(offline.draft).every((v) => v === "")).toBe(true);
    expect(offline.note).toMatch(/live AI model/);

    useModel("sk-test-not-used");
    vi.spyOn(AnthropicAIService.prototype, "readBusinessCard").mockRejectedValue(new Error("timeout"));
    const failed = await readBusinessCard({ buffer: JPEG, filename: "card.jpg" });
    expect(failed.source).toBe("offline");
    expect(Object.values(failed.draft).every((v) => v === "")).toBe(true);
    expect(failed.note).toMatch(/couldn't be read/);

    // Through the route as well: a 200 with the note, never a 500.
    const res = await postCard(new File([JPEG], "card.jpg", { type: "image/jpeg" }));
    expect(res.status).toBe(200);
    expect((await res.json()).note).toMatch(/couldn't be read/);
  });

  it("refuses anything but a photo, clearly", async () => {
    useModel("");
    const text = await postCard(new File(["Ana Example, Example Assistance"], "card.txt", { type: "text/plain" }));
    expect(text.status).toBe(400);
    expect((await text.json()).error.message).toMatch(/JPEG, PNG or WebP/);

    const pdf = await postCard(new File([Buffer.from("%PDF-1.7 a card as a PDF")], "card.pdf", { type: "application/pdf" }));
    expect(pdf.status).toBe(400);

    const big = await postCard(new File([Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)])], "card.jpg", { type: "image/jpeg" }));
    expect(big.status).toBe(400);
    expect((await big.json()).error.message).toMatch(/too large/);

    const empty = await postCard(new File([], "card.jpg", { type: "image/jpeg" }));
    expect(empty.status).toBe(400);
  });
});

describe("saving a business card as a lead", () => {
  it("creates a card lead without consent, and a second card with the same e-mail updates it", async () => {
    const card = CardLeadSchema.parse({ name: "Ben Example", company: "Example Travel Health", role: "COO", email: "Ben@Example.com", phone: "", website: "example.com" });
    const { lead, existing } = await saveCardLead(card, "presenter");
    expect(existing).toBe(false);
    expect(lead).toMatchObject({ source: "CARD", quoteNumber: "", email: "ben@example.com", role: "COO", createdBy: "presenter", contactConsentAt: null, contactConsentBy: null });
    expect(lead.notes).toBe("Website: example.com");

    const again = await saveCardLead(CardLeadSchema.parse({ name: "Ben Example", company: "Example Travel Health", email: "BEN@EXAMPLE.COM", phone: "+90 212 000 00 00" }), "presenter");
    expect(again.existing).toBe(true);
    expect(again.lead).toMatchObject({ id: lead.id, phone: "+90 212 000 00 00", role: "COO", contactConsentAt: null });
    // What the second card left blank isn't blanked, and the website line isn't added twice.
    expect(again.lead.notes).toBe("Website: example.com");
    expect(await leadsByEmail("ben@example.com")).toHaveLength(1);
  });

  it("goes onto the visitor's lead when they also left a card, keeping their own consent", async () => {
    const { lead: visitor } = await createVisitorLead({
      name: "Cara Example",
      company: "Example Medical Assistance",
      email: "cara@example.com",
      phone: "",
      role: "",
      segment: null,
      pains: [],
      message: "",
      consent: true,
      website: "",
    });
    const { lead, existing } = await saveCardLead(CardLeadSchema.parse({ name: "Cara Example", company: "Example Medical Assistance", role: "Medical director", email: "cara@example.com" }), null);
    expect(existing).toBe(true);
    expect(lead).toMatchObject({ id: visitor.id, source: "VISITOR", role: "Medical director", contactConsentBy: "visitor" });
  });

  it("matches a card without an e-mail address by company and name", async () => {
    const first = await saveCardLead(CardLeadSchema.parse({ name: "Dev Example", company: "Example Repatriation" }), null);
    const second = await saveCardLead(CardLeadSchema.parse({ name: "dev example", company: "EXAMPLE REPATRIATION", role: "Founder" }), null);
    expect(second).toMatchObject({ existing: true, lead: { id: first.lead.id, role: "Founder", contactConsentAt: null } });
  });

  it("checks the card before saving", async () => {
    expect(CardLeadSchema.safeParse({ name: "Ed", company: "Example Co", email: "not-an-address" }).success).toBe(false);
    expect(CardLeadSchema.safeParse({ name: "", company: "Example Co" }).success).toBe(false);
    const { POST } = await import("@/app/api/leads/card/save/route");
    const res = await POST(
      new Request("http://app/api/leads/card/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Fay Example", company: "" }) }),
      {}
    );
    expect(res.status).toBe(400);
  });
});

describe("importing the booked meetings", () => {
  const header = "customerName,companyName,email,phone,role,segment,meetingAt,brief";

  it("creates a lead per meeting, on Istanbul time, without consent", async () => {
    const csv = [
      header,
      'Gil Example,Example Assistance Group,gil@example.com,+33 1 00 00 00 00,CEO,assistance,2026-11-02 10:30,"Runs a 24/7 desk, three languages.\nShow: the hotline."',
      "Hana Example,Example Insurance,,,Claims director,Large group or insurer,2026-11-03T09:00:00Z,",
    ].join("\r\n");
    const res = await postImport(csv);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: 2, updated: 0 });

    const [gil] = await leadsByEmail("gil@example.com");
    expect(gil).toMatchObject({ source: "MEETING", quoteNumber: "", role: "CEO", segment: "assistance", contactConsentAt: null });
    // 10:30 in Istanbul (UTC+3) is 07:30 UTC.
    expect(gil.meetingAt?.toISOString()).toBe("2026-11-02T07:30:00.000Z");
    expect(gil.brief).toBe("Runs a 24/7 desk, three languages.\nShow: the hotline.");

    const hana = await prisma.lead.findFirstOrThrow({ where: { companyName: "Example Insurance", createdAt: { gte: testStart } } });
    expect(hana).toMatchObject({ email: null, segment: "insurer", brief: null });
    expect(hana.meetingAt?.toISOString()).toBe("2026-11-03T09:00:00.000Z");

    // The lead page's data carries the meeting.
    expect((await getLead(gil.id)).meetingAt?.toISOString()).toBe("2026-11-02T07:30:00.000Z");
  });

  it("updates the same leads when the list is imported again", async () => {
    const csv = [
      header,
      "Gil Example,Example Assistance Group,GIL@example.com,,,,2026-11-02 11:00,Moved to 11:00. Bring the bill review.",
      "Hana Example,example insurance,,,,,,",
    ].join("\n");
    const result = await importMeetings(csv, "presenter");
    expect(result).toEqual({ ok: true, created: 0, updated: 2 });

    const [gil] = await leadsByEmail("gil@example.com");
    expect(gil.meetingAt?.toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(gil.brief).toBe("Moved to 11:00. Bring the bill review.");
    // Blank cells keep what the lead had.
    expect(gil).toMatchObject({ phone: "+33 1 00 00 00 00", role: "CEO", segment: "assistance" });
    const hana = await prisma.lead.findMany({ where: { customerName: "Hana Example", createdAt: { gte: testStart } } });
    expect(hana).toHaveLength(1);
    expect(hana[0].meetingAt?.toISOString()).toBe("2026-11-03T09:00:00.000Z");
  });

  it("imports nothing when a row is wrong, and says which rows", async () => {
    const before = await prisma.lead.count();
    const csv = [
      header,
      "Ivo Example,Example Air Ambulance,ivo@example.com,,,,2026-11-04 09:30,",
      "Jo Example,Example Cost Containment,not-an-address,,,,2026-11-04 25:00,",
      ",Example Partner,,,,,,",
      "Kim Example,Example Hospital,ivo@example.com,,,hospital,,",
      "Lea Example,Example Network,,,,space agency,,",
    ].join("\n");
    const res = await postImport(csv);
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.code).toBe("INVALID_ROWS");
    expect(error.rows).toEqual([
      { row: 3, message: "email isn't an e-mail address" },
      { row: 3, message: expect.stringMatching(/^meetingAt isn't a time/) },
      { row: 4, message: "customerName (the person's name) is missing" },
      { row: 5, message: "The same e-mail address as row 2." },
      { row: 6, message: expect.stringMatching(/^segment isn't one of/) },
    ]);
    expect(await prisma.lead.count()).toBe(before);
    expect(await leadsByEmail("ivo@example.com")).toHaveLength(0);
  });

  it("checks the header row", async () => {
    const result = await importMeetings("customerName,company,meeting_at\nMia Example,Example Co,2026-11-05 10:00", null);
    expect(result).toEqual({
      ok: false,
      errors: [
        { row: 1, message: expect.stringMatching(/^Unknown column "company"/) },
        { row: 1, message: "The header row needs a companyName column." },
      ],
    });
  });
});

describe("the brief on the lead", () => {
  it("is set, changed and cleared through the lead's update", async () => {
    const { lead } = await saveCardLead(CardLeadSchema.parse({ name: "Noa Example", company: "Example Global Assist", email: "noa@example.com" }), null);
    const changes = LeadUpdateSchema.parse({ meetingAt: "2026-11-05T14:00:00+03:00", brief: "  Who: COO. Probe: night volume. Show: bill review.  " });
    const updated = await updateLead(lead.id, changes);
    expect(updated.meetingAt?.toISOString()).toBe("2026-11-05T11:00:00.000Z");
    expect(updated.brief).toBe("Who: COO. Probe: night volume. Show: bill review.");

    const cleared = await updateLead(lead.id, LeadUpdateSchema.parse({ meetingAt: null, brief: "" }));
    expect(cleared).toMatchObject({ meetingAt: null, brief: null, contactConsentAt: null });
    expect(LeadUpdateSchema.safeParse({ meetingAt: "2 Nov, 10:00" }).success).toBe(false);
  });
});
