import { describe, expect, it } from "vitest";
import { guaranteeEnquiryReply, missingItem, travellerReply, type TravellerFacts } from "@/lib/intake/replies";
import { summarizeCall } from "@/lib/services/ai/call-summary";
import { negotiationLimits } from "@/lib/services/bill-negotiation";
import { delayPayout, type Benefit } from "@/lib/services/policy";
import { recommendTransport, type TransportAssessment } from "@/lib/services/transport";
import { voiceLanguage } from "@/lib/voice/languages";
import { hospitalMatches, nameMatches } from "@/lib/voice/tools/provider";

// The pure pieces behind the ITIC meeting demos: delay payouts the voice
// agent quotes, medical transport rules, the negotiation's numbers, who a
// hospital caller may hear about, and the phrasebook e-mail replies.

describe("delay payout", () => {
  const premier: Benefit = {
    code: "TRIP_DELAY",
    label: "Trip delay",
    covered: true,
    limit: 600,
    unit: "EUR 50 per full 6 hours",
    excess: 0,
    waitingHours: 4,
    conditions: [],
  };

  it("pays per full block, so an 8-hour delay is one block", () => {
    expect(delayPayout(premier, 8)).toMatchObject({ amount: 50, currency: "EUR", basis: "1 full 6-hour block × 50 EUR = 50 EUR." });
    expect(delayPayout(premier, 13)?.amount).toBe(100);
  });

  it("pays nothing below the minimum delay, and caps at the limit", () => {
    expect(delayPayout(premier, 3)).toMatchObject({ amount: 0, basis: expect.stringMatching(/at least 4 hours/) });
    expect(delayPayout(premier, 5)).toMatchObject({ amount: 0, basis: expect.stringMatching(/less than one full 6-hour block/) });
    expect(delayPayout(premier, 80)).toMatchObject({ amount: 600, basis: expect.stringMatching(/capped at the 600 EUR limit/) });
  });

  it("has no payout for benefits that aren't paid per block or aren't covered", () => {
    expect(delayPayout({ ...premier, unit: undefined }, 8)).toBeNull();
    expect(delayPayout({ ...premier, covered: false }, 8)).toBeNull();
  });
});

describe("medical transport rules", () => {
  const base: TransportAssessment = {
    diagnosis: "Unstable angina, one stent",
    fitToFly: true,
    mobility: "SEATED",
    oxygenLpm: 0,
    monitoring: "NONE",
    intensiveCare: false,
    escort: "NONE",
    destinationCountry: "Germany",
  };

  it("picks the least intensive safe mode", () => {
    expect(recommendTransport(base).mode).toBe("COMMERCIAL");
    expect(recommendTransport({ ...base, mobility: "WHEELCHAIR", oxygenLpm: 2, escort: "NURSE" }).mode).toBe("COMMERCIAL_ESCORTED");
    expect(recommendTransport({ ...base, mobility: "STRETCHER" }).mode).toBe("COMMERCIAL_STRETCHER");
    expect(recommendTransport({ ...base, mobility: "STRETCHER", oxygenLpm: 6 }).mode).toBe("AIR_AMBULANCE");
    expect(recommendTransport({ ...base, intensiveCare: true }).mode).toBe("AIR_AMBULANCE");
  });

  it("marks cheaper modes unsuitable and shows what an air ambulance would have cost", () => {
    const rec = recommendTransport({ ...base, mobility: "WHEELCHAIR", oxygenLpm: 2, escort: "NURSE", fitFrom: "Monday" });
    expect(rec.options.map((o) => [o.mode, o.suitable])).toEqual([
      ["COMMERCIAL", false],
      ["COMMERCIAL_ESCORTED", true],
      ["COMMERCIAL_STRETCHER", true],
      ["AIR_AMBULANCE", true],
    ]);
    expect(rec.avoidedVsAirAmbulance).toBe(35000 - 4250);
    expect(rec.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/MEDIF/), "Fit to fly from Monday: plan the journey for then."]));
  });

  it("waits when the patient isn't fit to fly, and prices long-haul trips higher", () => {
    const waiting = recommendTransport({ ...base, fitToFly: false, fitFrom: "next week" });
    expect(waiting).toMatchObject({ mode: "NOT_FIT_TO_FLY", low: 0, high: 0 });
    expect(waiting.reasons[0]).toMatch(/Not fit to fly yet; the doctor expects next week/);
    expect(recommendTransport({ ...base, destinationCountry: "United States" })).toMatchObject({ distance: "LONG_HAUL", low: 900, high: 2500 });
  });
});

describe("bill negotiation numbers", () => {
  it("opens at the review, steps once, and never goes past a quarter of the saving", () => {
    expect(negotiationLimits({ recommended: 7582.5, savings: 4802.5 } as never)).toEqual({ target: 7582.5, secondOffer: 8190, walkAway: 8790 });
  });
});

describe("who a hospital caller may hear about", () => {
  it("matches the patient's name in any order and spelling of accents", () => {
    expect(nameMatches("Mrs Lena Marie Koch", "Lena", "Koch")).toBe(true);
    expect(nameMatches("Aylin Yılmaz", "Aylin", "Yilmaz")).toBe(true);
    expect(nameMatches("Lena Kochová", "Lena", "Koch")).toBe(false);
    // Speech recognition heard "Lena" as "Lina" on a live call.
    expect(nameMatches("Lina Koch", "Lena", "Koch")).toBe(true);
    expect(nameMatches("Lina Kach", "Lena", "Koch")).toBe(true);
    expect(nameMatches("Anna Koch", "Lena", "Koch")).toBe(false);
  });

  it("only shares a letter with the hospital it was issued to", () => {
    expect(hospitalMatches("Marmara Heart Center", "Marmara Demo Heart Center")).toBe(true);
    expect(hospitalMatches("Besiktas Sports Medicine", "Marmara Demo Heart Center")).toBe(false);
  });
});

describe("e-mail replies", () => {
  const facts: TravellerFacts = {
    name: "Carlos Garcia",
    documents: [],
    caseRef: "CASE-1015",
    caseStatus: "IN_PROGRESS",
    appointment: { date: "2026-10-19", time: "10:30", doctor: "Dr. Deniz Kaya", facility: "Besiktas Demo Sports Medicine" },
    guarantee: { hospital: "Besiktas Demo Sports Medicine", status: "ACKNOWLEDGED" },
    transport: "COMMERCIAL_ESCORTED",
    claim: { ref: "CLM-10240", status: "INFO_REQUESTED", missing: ["HOSPITAL_INVOICE", "POLICY_NUMBER"], complete: false },
  };

  it("answers in the traveller's language with the case's real state", () => {
    const { text, language } = travellerReply(facts, "es");
    expect(language).toBe("es");
    expect(text).toContain("Su caso CASE-1015 está en curso.");
    expect(text).toContain("Su cita con Dr. Deniz Kaya en Besiktas Demo Sports Medicine es el lunes, 19 de octubre a las 10:30.");
    expect(text).toContain("no se le pedirá ningún depósito");
    expect(text).toContain("vuelo regular con acompañamiento médico");
    expect(text).toContain("todavía necesitamos: la factura del hospital; el número de póliza");
  });

  it("falls back to English for languages outside the phrasebook", () => {
    expect(travellerReply(facts, "nl").language).toBe("en");
    expect(travellerReply({ ...facts, claim: { ...facts.claim!, missing: [], complete: true } }, "de").text).toContain("Alle erforderlichen Unterlagen liegen vor");
  });

  it("names the documents the claims team recorded as missing", () => {
    expect(["Itemised invoice missing", "Discharge summary missing", "Proof of payment missing", "Something else"].map(missingItem)).toEqual([
      "HOSPITAL_INVOICE",
      "DISCHARGE_SUMMARY",
      "PROOF_OF_PAYMENT",
      null,
    ]);
  });

  it("tells a hospital the guarantee's status and attaches the letter once it is sent", () => {
    const letter = {
      ref: "LOG-0902",
      status: "ACKNOWLEDGED" as const,
      amount: 11850,
      currency: "EUR",
      excess: 100,
      validUntil: "2026-10-21",
      sentVia: "FAX" as const,
      sentAt: "2026-10-14T08:00:00Z",
      acknowledgedAt: "2026-10-14T10:00:00Z",
    };
    const sent = guaranteeEnquiryReply({ patient: "Lena Koch", dateOfBirth: "1964-07-29", caseRef: "CASE-1022", letter }, "en");
    expect(sent.attachLetter).toBe(true);
    expect(sent.text).toContain("Letter of Guarantee LOG-0902: €11,850.00, valid until 21 October 2026; the patient pays an excess of €100.00.");
    const draft = guaranteeEnquiryReply({ patient: "Lena Koch", dateOfBirth: "1964-07-29", caseRef: "CASE-1022", letter: { ...letter, status: "DRAFT" } }, "tr");
    expect(draft).toMatchObject({ attachLetter: false });
    expect(draft.text).toContain("onay için vaka yöneticisinde");
  });
});

describe("voice languages and summaries", () => {
  it("finds a language by name or code", () => {
    expect(voiceLanguage("spanish")?.code).toBe("es");
    expect(voiceLanguage("ar")?.name).toBe("Arabic");
    expect(voiceLanguage("Klingon")).toBeNull();
  });

  it("summarises what the new agents recorded", () => {
    const negotiation = summarizeCall([], {
      direction: "outbound",
      agentId: "outbound-bill-negotiation",
      caseRef: "CASE-1022",
      outcome: { billAgreement: { outcome: "AGREED", amount: 8600, currency: "EUR", holdHarmless: true } },
    });
    expect(negotiation).toBe("Hospital billing agreed 8,600.00 EUR as full payment, and won't bill the patient the difference (case CASE-1022).");
    const provider = summarizeCall([], {
      direction: "inbound",
      outcome: {
        guaranteeEnquiry: { hospital: "Marmara Heart Center", letters: ["LOG-0902"] },
        guaranteeResent: { ref: "LOG-0902", via: "FAX" },
        topUpRequest: { letter_ref: "LOG-0902", new_estimated_total: 15500, currency: "EUR", reason: "stent added" },
      },
    });
    expect(provider).toBe(
      "Marmara Heart Center asked about LOG-0902; status and amount given. Re-sent LOG-0902 by fax. Hospital asked to raise LOG-0902 to 15,500 EUR (stent added); for a case manager."
    );
  });
});
