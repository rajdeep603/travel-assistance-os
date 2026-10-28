import { describe, expect, it } from "vitest";
import { toCardDraft } from "@/lib/services/business-cards";
import { MEETINGS_TEMPLATE, parseCsv, parseMeetingAt, readMeetingsCsv } from "@/lib/services/meeting-import";

// The meetings list as spreadsheets write it, and its times on the show's
// clock. Fictional people on reserved domains.

describe("reading a CSV", () => {
  it("handles quotes, commas, line breaks, a byte-order mark and CRLF", () => {
    const text = '﻿a,b,c\r\n"one, two","say ""hi""","line\nbreak"\r\nx,,z\r\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["one, two", 'say "hi"', "line\nbreak"],
      ["x", "", "z"],
    ]);
  });

  it("takes semicolons when the header has no commas (Excel in much of Europe)", () => {
    expect(parseCsv("customerName;companyName\nAna Example;Example, Ltd")).toEqual([
      ["customerName", "companyName"],
      ["Ana Example", "Example, Ltd"],
    ]);
  });
});

describe("meeting times", () => {
  it("reads a wall-clock time as Istanbul time", () => {
    expect(parseMeetingAt("2026-11-02 10:30")?.toISOString()).toBe("2026-11-02T07:30:00.000Z");
    expect(parseMeetingAt("2026-11-02T9:05")?.toISOString()).toBe("2026-11-02T06:05:00.000Z");
    expect(parseMeetingAt(" 2026-11-05 18:00:00 ")?.toISOString()).toBe("2026-11-05T15:00:00.000Z");
  });

  it("keeps an ISO instant's own offset", () => {
    expect(parseMeetingAt("2026-11-02T10:30:00Z")?.toISOString()).toBe("2026-11-02T10:30:00.000Z");
    expect(parseMeetingAt("2026-11-02T10:30:00+01:00")?.toISOString()).toBe("2026-11-02T09:30:00.000Z");
    expect(parseMeetingAt("2026-11-02T10:30+0530")?.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("refuses anything else", () => {
    for (const bad of ["02/11/2026 10:30", "2026-11-02", "2026-11-31 10:00", "2026-11-02 24:00", "tomorrow at ten", "2026-11-02T10:30:00+25:00"]) {
      expect(parseMeetingAt(bad), bad).toBeNull();
    }
  });
});

describe("checking a meetings list", () => {
  it("accepts forgiving headers and segment labels, and skips empty rows", () => {
    const { rows, errors } = readMeetingsCsv(
      ["Customer name,Company name,E-mail,Meeting at,Segment,Brief", "Ana Example,Example Assistance,ANA@EXAMPLE.COM,2026-11-02 10:30,Hospital international desk,Probe: GOP chasing", ",,,,,", ""].join("\n")
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        customerName: "Ana Example",
        companyName: "Example Assistance",
        email: "ana@example.com",
        phone: null,
        role: null,
        segment: "hospital",
        meetingAt: new Date("2026-11-02T07:30:00.000Z"),
        brief: "Probe: GOP chasing",
      },
    ]);
  });

  it("takes its own template as it is", () => {
    const { rows, errors } = readMeetingsCsv(MEETINGS_TEMPLATE);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "jane@example.com", segment: "assistance", meetingAt: new Date("2026-11-02T07:30:00.000Z") });
    expect(rows[0].brief?.split("\n")).toHaveLength(3);
  });

  it("says when there's nothing to import", () => {
    expect(readMeetingsCsv("customerName,companyName\n").errors).toEqual([{ row: 2, message: "The file has no meetings in it." }]);
    expect(readMeetingsCsv("").errors.map((e) => e.row)).toEqual([1, 1]);
  });

  it("flags two rows for the same person without an e-mail address", () => {
    const { errors } = readMeetingsCsv("customerName,companyName\nBen Example,Example Co\nben example,EXAMPLE CO");
    expect(errors).toEqual([{ row: 3, message: "The same company and name as row 2." }]);
  });
});

describe("a business card's draft", () => {
  it("is tidied and clipped to what a lead holds", () => {
    const draft = toCardDraft({ name: "Ana\nExample", company: null, jobTitle: "x".repeat(200), email: " MAILTO:Ana@Example.COM ", phone: null, website: null });
    expect(draft).toEqual({ name: "Ana Example", company: "", role: "x".repeat(120), email: "ana@example.com", phone: "", website: "" });
  });
});
