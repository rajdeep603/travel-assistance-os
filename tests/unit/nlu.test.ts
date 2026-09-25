import { describe, expect, it } from "vitest";
import {
  findCity,
  findDistrict,
  findEmail,
  findExistingCaseRef,
  findLanguage,
  findName,
  findPhone,
  findSpecialty,
  matchSymptoms,
  maxUrgency,
  parseDateExpression,
  parseTimeExpression,
} from "@/lib/services/nlu";

describe("NLU: locations", () => {
  it("finds Istanbul districts", () => {
    expect(findDistrict("We are staying near Taksim")).toBe("Taksim");
    expect(findDistrict("hotel in Kadikoy tonight")).toBe("Kadikoy");
    expect(findDistrict("no district here")).toBeNull();
  });

  it("resolves cities, including via districts", () => {
    expect(findCity("I'm in Antalya")).toBe("Antalya");
    expect(findCity("staying near Sisli")).toBe("Istanbul");
    expect(findCity("somewhere in the alps")).toBeNull();
  });
});

describe("NLU: symptoms", () => {
  it("maps stomach pain to gastroenterology with HIGH urgency", () => {
    const rules = matchSymptoms("severe stomach pain since last night");
    expect(rules.map((r) => r.specialty)).toContain("Gastroenterology");
    expect(maxUrgency(rules, "severe stomach pain")).toBe("HIGH");
  });

  it("does not match 'ear' inside 'near' (word boundaries)", () => {
    const rules = matchSymptoms("we are staying near the hotel");
    expect(rules.map((r) => r.specialty)).not.toContain("Ear, Nose & Throat");
  });

  it("flags chest pain as CRITICAL", () => {
    const rules = matchSymptoms("my father has chest pain");
    expect(maxUrgency(rules, "chest pain")).toBe("CRITICAL");
  });

  it("boosts urgency for intensifiers", () => {
    const rules = matchSymptoms("a fever");
    expect(maxUrgency(rules, "an extreme fever")).toBe("HIGH");
  });
});

describe("NLU: dates and times", () => {
  const monday = new Date("2026-09-21T10:00:00"); // a Monday

  it("parses relative days", () => {
    expect(parseDateExpression("see a doctor tomorrow", monday)).toBe("2026-09-22");
    expect(parseDateExpression("today if possible", monday)).toBe("2026-09-21");
    expect(parseDateExpression("the day after tomorrow", monday)).toBe("2026-09-23");
  });

  it("parses weekday names to the next occurrence", () => {
    expect(parseDateExpression("on friday", monday)).toBe("2026-09-25");
    expect(parseDateExpression("next monday works", monday)).toBe("2026-09-28");
  });

  it("parses times and day parts", () => {
    expect(parseTimeExpression("2 pm would be great")).toBe("14:00");
    expect(parseTimeExpression("at 09:30")).toBe("09:30");
    expect(parseTimeExpression("in the afternoon")).toBe("afternoon");
    expect(parseTimeExpression("no time here")).toBeNull();
  });
});

describe("NLU: entities", () => {
  it("extracts names but never geography", () => {
    expect(findName("My name is Sarah Mitchell")).toBe("Sarah Mitchell");
    expect(findName("i'm daniel foster")).toBe("Daniel Foster");
    expect(findName("I'm travelling in Istanbul and I need a doctor")).toBeNull();
    expect(findName("I am not feeling well")).toBeNull();
  });

  it("extracts phone numbers and emails", () => {
    expect(findPhone("call me on +44 7700 900123 please")).toBe("+44 7700 900123");
    expect(findEmail("mail me at traveller@example.com")).toBe("traveller@example.com");
  });

  it("finds case references and specialties and languages", () => {
    expect(findExistingCaseRef("regarding case-1024 please")).toBe("CASE-1024");
    expect(findSpecialty("I need a cardiology appointment")).toBe("Cardiology");
    expect(findLanguage("a German speaking doctor")).toBe("German");
  });
});
