import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ASSUMPTIONS, DEFAULT_COST_CONTAINMENT, DEFAULT_INPUTS, DEFAULT_RUNNING_COST_PRICES, businessCaseReport } from "@/lib/business-case";
import { INTAKE_REQUESTS, QUICK_SAMPLE_REQUEST } from "@/lib/samples/intake-requests";
import { isSampleFile, isSampleRequest } from "@/lib/samples/fingerprints";
import { resetAIService, runAI, withOfflineAI } from "@/lib/services/ai";
import { renderQuotationPdf } from "@/lib/services/business-case-pdf";
import { extractTextFromFile } from "@/lib/services/pdf";
import { nightOf, shiftWindow } from "@/lib/services/shift-handover";
import { quoteMeta } from "@/lib/business-case";
import { PILOTS } from "@/lib/pilots";
import { sniffType } from "@/lib/uploads";
import { howItWorks } from "@/lib/voice/demo-scenarios";
import { listAgents } from "@/lib/voice/agents/registry";
import { toolAbilityLabel } from "@/lib/voice/tool-labels";
import { VOICE_LANGUAGES } from "@/lib/voice/languages";

// The ITIC veteran-review quick wins: samples stay on the rehearsed path, photos
// are accepted, the night shift is a fixed window, pilots reach the quotation,
// and every agent explains its limits.

describe("bundled samples keep their rehearsed figures", () => {
  const original = process.env.AI_API_KEY;
  afterEach(() => {
    process.env.AI_API_KEY = original;
    resetAIService();
  });

  it("recognises a sample file by its bytes, whatever its name", async () => {
    const dir = path.join(process.cwd(), "public", "demo-documents");
    const file = fs.readdirSync(dir).find((f) => f.endsWith(".pdf"))!;
    expect(await isSampleFile(fs.readFileSync(path.join(dir, file)))).toBe(true);
    expect(await isSampleFile(Buffer.from("%PDF-1.7 a visitor's own invoice"))).toBe(false);
  });

  it("recognises the sample requests, ignoring whitespace", async () => {
    expect(await isSampleRequest(`  ${QUICK_SAMPLE_REQUEST.replace(/ /g, "\n")} `)).toBe(true);
    expect(await isSampleRequest(INTAKE_REQUESTS[0].text)).toBe(true);
    expect(await isSampleRequest("My wife fell in Antalya and hurt her wrist.")).toBe(false);
  });

  it("runs on the offline rules inside the offline scope, even with a live model configured", async () => {
    process.env.AI_API_KEY = "sk-test-not-used";
    resetAIService();
    const { source, value } = await withOfflineAI(() => runAI("translateText", (ai) => ai.translateText("Merhaba", "English")));
    expect(source).toBe("offline");
    expect(typeof value).toBe("string");
  });
});

describe("photos of documents", () => {
  it("are recognised by their bytes", () => {
    expect(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe("image/jpeg");
    expect(sniffType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe("image/png");
    expect(sniffType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]))).toBe("image/webp");
  });
});

describe("the night shift", () => {
  it("runs 20:00 to 08:00 Istanbul time and is named by its evening", () => {
    // 03:10 in Istanbul on the 16th (UTC+3) belongs to the night of the 15th.
    expect(nightOf(new Date("2026-10-16T00:10:00Z"))).toBe("2026-10-15");
    expect(nightOf(new Date("2026-10-15T17:30:00Z"))).toBe("2026-10-15"); // 20:30
    expect(nightOf(new Date("2026-10-15T09:00:00Z"))).toBeNull(); // 12:00, a day shift
    const { start, end } = shiftWindow("2026-10-15");
    expect(start.toISOString()).toBe("2026-10-15T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-16T05:00:00.000Z");
  });
});

describe("60-day pilots in the quotation", () => {
  const input = {
    operation: DEFAULT_INPUTS,
    assumptions: DEFAULT_ASSUMPTIONS,
    prices: DEFAULT_RUNNING_COST_PRICES,
    costContainment: DEFAULT_COST_CONTAINMENT,
    quote: { customerName: "Aylin Kaya", companyName: "Pilot Test Assistance", email: "", phone: "", services: [], pilot: "provider-line" },
  };

  it("names the pilot and its measures in the summary", () => {
    const report = businessCaseReport(input);
    expect(report.quote.pilot?.id).toBe("provider-line");
    expect(report.summary).toContain("60-day pilot: Hospital guarantee status line");
    expect(report.summary).toContain("- Provider calls resolved by the AI");
  });

  it("prints the pilot's plan in the PDF", async () => {
    const report = businessCaseReport(input);
    const pdf = await renderQuotationPdf(report, quoteMeta(input, "2026-10-21"));
    const text = (await extractTextFromFile(pdf, "application/pdf")).replace(/\s+/g, " ");
    expect(text).toContain("60-day pilot: Hospital guarantee status line");
    expect(text).toContain("Days 57–60");
  });

  it("ignores a pilot it doesn't know", () => {
    expect(businessCaseReport({ ...input, quote: { ...input.quote, pilot: "nonsense" } }).quote.pilot).toBeNull();
  });

  it("never puts a price in a template", () => {
    for (const p of PILOTS) for (const s of p.services) expect(s).not.toMatch(/[€$£]|\d[\d,.]*\s*(EUR|USD|k\b)/);
  });
});

describe("how each agent works", () => {
  it("says what every listed agent can do, never does and when a person takes over", () => {
    for (const agent of listAgents().filter((a) => a.id !== "interpreter")) {
      const how = howItWorks(agent);
      expect(how.can.length, agent.id).toBeGreaterThan(0);
      expect(how.never.length, agent.id).toBeGreaterThan(3);
      expect(how.handsOver.length, agent.id).toBeGreaterThan(0);
      expect(how.can, agent.id).not.toContain("Ends the call");
    }
  });

  it("turns tool activities into abilities", () => {
    expect(toolAbilityLabel("check_coverage")).toBe("Checks the policy coverage");
    expect(toolAbilityLabel("resend_guarantee")).toBe("Re-sends the guarantee to the hospital");
    expect(toolAbilityLabel("cancel_appointment")).toBe("Cancels the appointment");
  });
});

describe("voice languages", () => {
  it("cover the meeting list's languages, once each", () => {
    const names = VOICE_LANGUAGES.map((l) => l.name);
    for (const n of ["Romanian", "Serbian", "Danish", "Dutch", "Greek", "Ukrainian", "Persian", "Urdu"]) expect(names).toContain(n);
    expect(new Set(VOICE_LANGUAGES.map((l) => l.code)).size).toBe(VOICE_LANGUAGES.length);
  });
});
