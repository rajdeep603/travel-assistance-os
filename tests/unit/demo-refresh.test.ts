import { describe, expect, it } from "vitest";
import { shiftDatesInText, shiftDaysFor } from "../../scripts/demo-refresh";

// The demo refresh moves dates written inside text along with the records, and
// leaves facts (birth dates, references) alone.

const FROM = "2026-08-01";
const TO = "2028-03-01";
const move = (text: string, days = 9) => shiftDatesInText(text, days, FROM, TO);

describe("demo refresh: dates in text", () => {
  it("moves ISO dates and timestamps", () => {
    expect(move("Admission: 2026-10-21")).toBe("Admission: 2026-10-30");
    expect(move('{"at":"2026-10-23T15:47:11.000Z"}')).toBe('{"at":"2026-11-01T15:47:11.000Z"}');
  });

  it("moves spoken dates and recomputes the weekday", () => {
    expect(move("can see you on Monday 19 October at two p.m.")).toBe("can see you on Wednesday 28 October at two p.m.");
  });

  it("moves day-month dates and ranges, across a month end", () => {
    expect(move("admitted from 18 to 20 October")).toBe("admitted from 27 to 29 October");
    expect(move("from 21 to 23 October", 10)).toBe("from 31 October to 2 November");
    expect(move("fractured her wrist on 20 October")).toBe("fractured her wrist on 29 October");
    expect(move("Night shift 22 Oct", 10)).toBe("Night shift 1 Nov");
  });

  it("leaves birth dates, references and dates outside the demo alone", () => {
    expect(move("born 1956-12-05, 11 June 1969")).toBe("born 1956-12-05, 11 June 1969");
    expect(move("APT-2026-1006 and LOG-0903, tariff 2026.1")).toBe("APT-2026-1006 and LOG-0903, tariff 2026.1");
    expect(move("policy wording effective 2026-01-01")).toBe("policy wording effective 2026-01-01");
  });

  it("goes back exactly where it came from", () => {
    const text = 'Monday 19 October; from 9 to 12 October; from 28 to 30 October; 2026-10-21; {"at":"2026-10-23T15:47:11.000Z"}';
    expect(shiftDatesInText(move(text, -9), 9, FROM, TO)).toBe(text);
  });
});

describe("demo refresh: how far to move", () => {
  const now = new Date("2026-11-03T06:00:00Z"); // 09:00 in Istanbul

  it("brings the latest activity to today", () => {
    expect(shiftDaysFor(new Date("2026-10-22T04:30:00Z"), now)).toBe(12);
  });

  it("never moves a record past now", () => {
    // 14:58 in Istanbul on 22 October: today at 14:58 is still ahead, so yesterday.
    expect(shiftDaysFor(new Date("2026-10-22T11:58:00Z"), now)).toBe(11);
  });

  it("does nothing for fresh data", () => {
    expect(shiftDaysFor(new Date("2026-11-03T05:00:00Z"), now)).toBe(0);
  });
});
