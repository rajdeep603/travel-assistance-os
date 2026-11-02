import { describe, expect, it } from "vitest";
import { openStateFromHours, openStateFromSlots, parseHours, timeZoneForCity } from "@/lib/services/provider-hours";
import { CARE_NEEDS, needById, priceItemFromLabel, priceItemsFor, providerMeetsNeed, resolveLocation } from "@/lib/services/provider-needs";
import { providerIssues } from "@/lib/services/provider-health";
import { cleanValidation, servicesToConfirm, statusFromValidation, validationBrief } from "@/lib/services/provider-validation";
import type { Provider } from "@prisma/client";

// Wednesday 2026-11-04 at 10:30 in Istanbul (07:30 UTC).
const WED_MORNING = new Date("2026-11-04T07:30:00Z");
// Wednesday 2026-11-04 at 22:30 in Istanbul (19:30 UTC).
const WED_NIGHT = new Date("2026-11-04T19:30:00Z");

const provider = (over: Partial<Provider> = {}): Provider => ({
  id: "p1",
  ref: "PRV-2001",
  name: "Dr. Deniz Arslan",
  facility: "Taksim Demo International Clinic",
  specialty: "General Medicine",
  address: "Istiklal Cd. 12",
  district: "Taksim",
  city: "Istanbul",
  country: "Turkiye",
  latitude: 41.037,
  longitude: 28.9857,
  languages: ["Turkish", "English"],
  phone: "+90 212 000 2001",
  email: "d.arslan@demo-clinic.example",
  rating: 4.8,
  availability: { mon: ["09:00", "10:00"], wed: ["09:00", "10:00", "11:00"] },
  kind: "CLINIC",
  accreditations: [],
  rateCard: null,
  aliases: [],
  mergedIntoId: null,
  status: "UNVERIFIED",
  lastVerifiedAt: null,
  verificationNote: null,
  hours: null,
  acceptsDirectBilling: null,
  priceListStatus: "NONE",
  internalRating: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("opening hours", () => {
  it("parses day ranges and finds the practice open in its own zone", () => {
    const week = parseHours("Mon–Fri 8:00–18:00, Sat 9:00–13:00");
    expect(week?.[0]).toEqual([{ start: 480, end: 1080 }]);
    expect(week?.[5]).toEqual([{ start: 540, end: 780 }]);
    expect(week?.[6]).toEqual([]);
    expect(openStateFromHours("Mon–Fri 8:00–18:00, Sat 9:00–13:00", "Europe/Istanbul", WED_MORNING)).toEqual({ open: true, until: "18:00" });
    expect(openStateFromHours("Mon–Fri 8:00–18:00, Sat 9:00–13:00", "Europe/Istanbul", WED_NIGHT)).toEqual({ open: false, opensAt: "Thu 8:00" });
  });

  it("knows 24/7 and 'daily'", () => {
    expect(openStateFromHours("24/7", "Europe/Istanbul", WED_NIGHT).open).toBe(true);
    expect(openStateFromHours("8:00–22:00 daily", "Europe/Istanbul", WED_NIGHT)).toEqual({ open: false, opensAt: "Thu 8:00" });
    expect(openStateFromHours("8:00–22:00 daily", "Europe/Istanbul", WED_MORNING)).toEqual({ open: true, until: "22:00" });
  });

  it("falls back to the slot template on the demo's clock", () => {
    expect(openStateFromSlots({ wed: ["09:00", "10:00", "11:00"] }, WED_MORNING)).toEqual({ open: true, until: "11:30" });
    expect(openStateFromSlots({ wed: ["09:00"], thu: ["14:00"] }, WED_NIGHT)).toEqual({ open: false, opensAt: "Thu 14:00" });
  });

  it("picks the zone from the city", () => {
    expect(timeZoneForCity("Singapore")).toBe("Asia/Singapore");
    expect(timeZoneForCity("Istanbul")).toBe("Europe/Istanbul");
  });
});

describe("needs and places", () => {
  it("maps a need to the specialties and kinds that answer it", () => {
    const urgent = needById("urgent")!;
    expect(providerMeetsNeed({ specialty: "General Medicine", kind: "CLINIC" }, urgent)).toBe(true);
    expect(providerMeetsNeed({ specialty: "Dentistry", kind: "CLINIC" }, urgent)).toBe(false);
    expect(providerMeetsNeed({ specialty: "Cardiology", kind: "HOSPITAL" }, needById("emergency")!)).toBe(true);
    expect(CARE_NEEDS.every((n) => n.short.length <= 12)).toBe(true);
  });

  it("resolves a district or a hotel from text", () => {
    expect(resolveLocation("The patient is in a hotel in Kadikoy")?.id).toBe("kadikoy");
    expect(resolveLocation("Pera Palace")?.id).toBe("pera-palace");
    expect(resolveLocation("somewhere unknown")).toBeNull();
  });

  it("asks the prices that fit the provider and reads quoted labels back", () => {
    expect(priceItemsFor({ kind: "HOSPITAL", specialty: "Cardiology" })).toContain("ER_VISIT");
    expect(priceItemsFor({ kind: "CLINIC", specialty: "Dentistry" })).toEqual(["DENTAL_EXAM"]);
    expect(priceItemFromLabel("Consultation with a general practitioner")).toBe("CONSULTATION");
    expect(priceItemFromLabel("x-ray of the wrist")).toBe("XRAY");
    expect(priceItemFromLabel("parking")).toBeNull();
  });
});

describe("validation", () => {
  it("briefs Ada on behalf of CareTrail, not a client", () => {
    const brief = validationBrief(provider(), { link: "https://caretrail.example/p/abc" });
    expect(brief.client).toBe("CareTrail");
    expect(String(brief.about_client)).toContain("assistance company");
    expect(brief.reference).toBe("PRV-2001");
    expect(brief.price_list_link).toBe("https://caretrail.example/p/abc");
    expect(servicesToConfirm(provider({ kind: "HOSPITAL", specialty: "Cardiology" }))).toContain("Emergency department");
  });

  it("turns the answers into a status: closed beats moved beats verified", () => {
    expect(statusFromValidation({ reached_right_place: true, operating: true })).toBe("VERIFIED");
    expect(statusFromValidation({ reached_right_place: true, operating: true, new_address: "Moda Cd. 5" })).toBe("MOVED");
    expect(statusFromValidation({ reached_right_place: true, operating: false })).toBe("CLOSED");
    expect(statusFromValidation({ reached_right_place: false, operating: null })).toBe("UNREACHABLE");
    expect(cleanValidation({ reached_right_place: true, new_address: "none given", hours: "Mon–Fri 9–18" })).toEqual({ reached_right_place: true, hours: "Mon–Fri 9–18" });
  });
});

describe("network health", () => {
  it("lists what is wrong with a record, worst first", () => {
    const issues = providerIssues({ ...provider({ status: "UNREACHABLE" }), _count: { prices: 0 } }, { now: WED_MORNING });
    expect(issues.map((i) => i.code)).toEqual(["FLAGGED", "STALE", "MISSING_HOURS", "BILLING_UNKNOWN", "NO_PRICES"]);
    expect(issues[0].severity).toBe("high");
  });

  it("is quiet on a clean, verified record", () => {
    const clean = provider({ status: "VERIFIED", lastVerifiedAt: new Date("2026-10-01T00:00:00Z"), hours: "Mon–Fri 8:00–18:00", acceptsDirectBilling: true });
    expect(providerIssues({ ...clean, _count: { prices: 2 } }, { now: WED_MORNING })).toEqual([]);
  });
});
