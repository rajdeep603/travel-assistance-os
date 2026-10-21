import { afterEach, describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatDayTime, formatTime } from "@/lib/format";
import {
  OPERATION_TIME_ZONE,
  TIME_ZONES,
  TIME_ZONE_COOKIE,
  applyDisplayTimeZone,
  getDisplayTimeZone,
  isTimeZone,
  timeZoneClock,
  timeZoneFromCookie,
  timeZoneLabel,
  timeZoneOffset,
} from "@/lib/time-zone";

// One instant, shown in whichever clock the viewer picked in the header.
const instant = new Date("2026-10-19T17:00:00Z"); // 20:00 in Istanbul, 22:30 in India, 13:00 in New York

afterEach(() => applyDisplayTimeZone(OPERATION_TIME_ZONE));

describe("the display time zone", () => {
  it("defaults to where the operation runs", () => {
    expect(getDisplayTimeZone()).toBe("Europe/Istanbul");
    expect(formatDateTime(instant)).toBe("19 Oct 2026, 20:00");
    expect(formatTime(instant)).toBe("20:00");
    expect(formatDayTime(instant)).toBe("Mon 19 Oct, 20:00");
  });

  it("moves every formatted time when applied", () => {
    applyDisplayTimeZone("Asia/Kolkata");
    expect(formatDateTime(instant)).toBe("19 Oct 2026, 22:30");
    expect(formatTime(instant)).toBe("22:30");
    applyDisplayTimeZone("America/New_York");
    expect(formatDayTime(instant)).toBe("Mon 19 Oct, 13:00");
    expect(formatDate(new Date("2026-10-19T02:30:00Z"))).toBe("18 Oct 2026");
  });

  it("takes an explicit zone for server-rendered parts", () => {
    expect(formatTime(instant, "Asia/Singapore")).toBe("01:00");
    expect(formatDateTime(instant, "UTC")).toBe("19 Oct 2026, 17:00");
  });

  it("falls back to the operation's zone for anything it doesn't know", () => {
    expect(isTimeZone("Asia/Kolkata")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone(42)).toBe(false);
    expect(applyDisplayTimeZone("Mars/Olympus")).toBe("Europe/Istanbul");
    expect(getDisplayTimeZone()).toBe("Europe/Istanbul");
  });

  it("reads the cookie and ignores a bad one", () => {
    expect(timeZoneFromCookie(`other=1; ${TIME_ZONE_COOKIE}=${encodeURIComponent("Asia/Kolkata")}`)).toBe("Asia/Kolkata");
    expect(timeZoneFromCookie(`${TIME_ZONE_COOKIE}=Nowhere%2FPlace`)).toBeNull();
    expect(timeZoneFromCookie(null)).toBeNull();
  });

  it("names zones, tells the time there and the offset", () => {
    expect(timeZoneLabel("Asia/Kolkata")).toBe("India");
    expect(timeZoneLabel("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(timeZoneClock("Asia/Kolkata", instant)).toBe("22:30");
    expect(timeZoneOffset("Asia/Kolkata", instant)).toBe("UTC+5:30");
    expect(timeZoneOffset("Europe/Istanbul", instant)).toBe("UTC+3");
    expect(timeZoneOffset("America/New_York", instant)).toBe("UTC−4");
    expect(timeZoneOffset("UTC", instant)).toBe("UTC");
  });

  it("offers only zones the runtime knows, the operation's first", () => {
    expect(TIME_ZONES[0]).toMatchObject({ id: OPERATION_TIME_ZONE, region: "Operation" });
    for (const z of TIME_ZONES) expect(isTimeZone(z.id)).toBe(true);
    expect(new Set(TIME_ZONES.map((z) => z.id)).size).toBe(TIME_ZONES.length);
  });
});
