import { afterEach, describe, expect, it } from "vitest";
import {
  addDays,
  daysFromToday,
  formatPlainDate,
  isPastSlot,
  utcToZoned,
  weekdayKey,
  zonedDayRange,
  zonedToUtc,
  zonedToday,
} from "@/lib/time";

// Istanbul is UTC+3 all year. Every assertion must hold whatever timezone
// the host runs in (containers run in UTC, laptops in local time).
const HOST_ZONES = ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Europe/Istanbul"];
const originalTZ = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTZ;
});

describe.each(HOST_ZONES)("operational clock with host TZ=%s", (tz) => {
  it("converts Istanbul wall-clock slots to the right UTC instant and back", () => {
    process.env.TZ = tz;
    const instant = zonedToUtc("2026-10-16", "14:00");
    expect(instant.toISOString()).toBe("2026-10-16T11:00:00.000Z");
    expect(utcToZoned(instant)).toEqual({ date: "2026-10-16", time: "14:00" });
  });

  it("derives 'today' in Istanbul, not on the host", () => {
    process.env.TZ = tz;
    // 22:30 UTC on the 15th is already 01:30 on the 16th in Istanbul.
    const lateEvening = new Date("2026-10-15T22:30:00Z");
    expect(zonedToday(0, lateEvening)).toBe("2026-10-16");
    expect(zonedToday(1, lateEvening)).toBe("2026-10-17");
  });

  it("bounds an Istanbul day in UTC", () => {
    process.env.TZ = tz;
    const { start, end } = zonedDayRange("2026-10-16");
    expect(start.toISOString()).toBe("2026-10-15T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-16T21:00:00.000Z");
  });
});

describe("plain calendar helpers", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("names weekdays without consulting the host clock", () => {
    expect(weekdayKey("2026-10-16")).toBe("fri");
    expect(weekdayKey("2026-10-18")).toBe("sun");
  });

  it("detects past slots relative to now", () => {
    const now = new Date("2026-10-16T11:30:00Z"); // 14:30 Istanbul
    expect(isPastSlot("2026-10-16", "14:00", now)).toBe(true);
    expect(isPastSlot("2026-10-16", "15:00", now)).toBe(false);
    expect(daysFromToday("2026-10-17", now)).toBe(1);
  });

  it("formats plain dates without shifting the day", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(formatPlainDate("2026-10-16")).toBe("Fri 16 Oct");
  });

  it("rejects malformed input instead of guessing", () => {
    expect(Number.isNaN(zonedToUtc("2026-02-30", "10:00").getTime())).toBe(true);
    expect(Number.isNaN(zonedToUtc("2026-10-16", "25:00").getTime())).toBe(true);
  });
});
