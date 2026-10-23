import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dictionaryEntries, directionOf, translate, uiLanguageFromCookie } from "@/lib/i18n";
import { formatEnum } from "@/lib/format";
import { collectStrings } from "../../scripts/i18n/strings";

// The interface language: every entry carries all four translations, the
// navigation and the statuses on every badge are covered, and anything not in
// the dictionary falls back to English.

describe("interface language", () => {
  it("has Spanish, French, Portuguese and Arabic for every entry", () => {
    for (const [english, translations] of dictionaryEntries()) {
      expect(translations, english).toHaveLength(4);
      for (const t of translations) expect(t.trim().length, english).toBeGreaterThan(0);
    }
    // Arabic is in Arabic script.
    expect(translate("Dashboard", "ar")).toMatch(/[؀-ۿ]/);
  });

  it("translates the whole navigation", () => {
    // The labels in src/components/nav.tsx (a .tsx file the node test runner doesn't load).
    const nav = [
      "Assistance", "Medical and money", "Network", "Sales and platform",
      "Dashboard", "AI Case Manager", "Inbox & WhatsApp", "Voice Agents", "Call Center", "Internal AI Assistant",
      "Medical Document AI", "Claims Automation", "Provider Search", "Receivables", "Partner oversight",
      "Business Case", "Leads", "Trust & Integration", "Developers (API)",
    ];
    for (const label of nav) expect(translate(label, "ar"), label).not.toBe(label);
  });

  it("translates every case, claim, guarantee and receivable status", () => {
    const statuses = ["NEW", "IN_PROGRESS", "PENDING_INFO", "ESCALATED", "RESOLVED", "CLOSED", "SUBMITTED", "PROCESSING", "NEEDS_REVIEW", "INFO_REQUESTED", "APPROVED", "REJECTED", "PAID", "DRAFT", "SENT", "ACKNOWLEDGED", "PARTIALLY_PAID", "DISPUTED", "CRITICAL", "HIGH"];
    for (const s of statuses) expect(translate(formatEnum(s), "pt"), s).not.toBe(formatEnum(s));
  });

  it("falls back to English, reads the cookie and sets the direction", () => {
    expect(translate("Not in the dictionary", "ar")).toBe("Not in the dictionary");
    expect(uiLanguageFromCookie("caretrail-tz=Europe%2FIstanbul; caretrail-lang=ar")).toBe("ar");
    expect(uiLanguageFromCookie("caretrail-lang=xx")).toBe("en");
    expect(directionOf("ar")).toBe("rtl");
    expect(directionOf("es")).toBe("ltr");
  });
});

// The generated dictionaries behind InterfaceTranslator (npm run i18n:translate).
describe("interface strings", () => {
  const LANGS = ["es", "fr", "pt", "ar"] as const;
  const dictionaries = Object.fromEntries(
    LANGS.map((l) => [l, JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/lib/i18n-interface", `${l}.json`), "utf8")) as Record<string, string>])
  ) as Record<(typeof LANGS)[number], Record<string, string>>;

  it("has the same strings in every language, none empty", () => {
    const keys = Object.keys(dictionaries.es).sort();
    expect(keys.length).toBeGreaterThan(1000);
    for (const l of LANGS) {
      expect(Object.keys(dictionaries[l]).sort(), l).toEqual(keys);
      for (const k of keys) expect(dictionaries[l][k].trim().length, `${l}: ${k}`).toBeGreaterThan(0);
    }
    expect(Object.values(dictionaries.ar).filter((v) => /[؀-ۿ]/.test(v)).length / keys.length).toBeGreaterThan(0.95);
  });

  it("keeps product names, references and currency codes as they are", () => {
    const KEEP = /CareTrail|Sthiram|WhatsApp|Twilio|\b[A-Z]{2,4}-\d{3,5}\b|\b(?:EUR|USD|GBP|TRY|AED|ZAR|BRL|CHF)\b|⌘K/g;
    for (const en of Object.keys(dictionaries.es)) {
      for (const token of en.match(KEEP) ?? []) {
        for (const l of LANGS) expect(dictionaries[l][en], `${l}: ${en}`).toContain(token);
      }
    }
  });

  it("covers the interface strings in the code", () => {
    const curated = new Set(dictionaryEntries().map(([en]) => en));
    const strings = collectStrings().filter((s) => !curated.has(s));
    const covered = strings.filter((s) => dictionaries.ar[s]);
    // New text shows in English until `npm run i18n:translate` runs; keep that rare.
    expect(covered.length / strings.length).toBeGreaterThan(0.9);
  });
});
