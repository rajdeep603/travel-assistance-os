import { describe, expect, it } from "vitest";
import { overviewPdfName, renderOverviewPdf } from "@/lib/services/overview-pdf";
import type { Overview } from "@/lib/services/overview";
import { extractTextFromFile } from "@/lib/services/pdf";

// The operations summary: the overview's figures on one page, in the viewer's clock.

const overview: Overview = {
  days: 30,
  caseCounts: { NEW: 2, IN_PROGRESS: 5, PENDING_INFO: 2, ESCALATED: 1, RESOLVED: 7, CLOSED: 1 },
  claimCounts: { SUBMITTED: 1, PROCESSING: 1, NEEDS_REVIEW: 2, INFO_REQUESTED: 2, APPROVED: 2, REJECTED: 1, PAID: 1 },
  openCases: 10,
  claimsInReview: 6,
  upcomingAppointments: 5,
  documentsProcessed: 30,
  decisions: [
    { count: 2, label: "hospital bill reviews to accept", href: "/claims" },
    { count: 0, label: "guarantee letters to approve", href: "/cases" },
    { count: 1, label: "escalated case", href: "/cases" },
  ],
  reviewHref: "/claims",
  outcomes: {
    days: 30,
    calls: { ended: 29, byAi: 27, transferred: 2, aiShare: 27 / 29, answerSeconds: 1 },
    inbox: { received: 15, automated: 13, automatedShare: 13 / 15, replyMinutes: 0.55 },
    letters: { sent: 5, turnaroundMinutes: 0.4 },
    documents: { read: 30, avgConfidence: 0.86 },
    languages: ["English", "German", "Spanish", "Turkish"],
  },
  money: {
    days: 30,
    billsReviewed: 10,
    savingsIdentifiedEur: 11_241,
    savingsAcceptedEur: 6_314,
    awaitingDecision: 2,
    averageSavingShare: 0.34,
    openGuarantees: { count: 4, eur: 27_400 },
  },
  handover: {
    night: "2026-10-19",
    start: new Date("2026-10-19T17:00:00Z"),
    end: new Date("2026-10-20T05:00:00Z"),
    inProgress: false,
    calls: { total: 16, byAi: 15, transferred: 1, emergencies: 1, languages: ["German", "Russian", "Spanish"] },
    inbox: { received: 0, automated: 0, needsReview: 0 },
    cases: { opened: 0, critical: 0 },
    lettersSent: 0,
    events: [],
    nights: [{ night: "2026-10-19", activity: 16 }],
  },
};

describe("the operations summary PDF", () => {
  it("prints the overview's figures on one page, in the viewer's time zone", async () => {
    const pdf = await renderOverviewPdf(overview, { timeZone: "Asia/Kolkata", now: new Date("2026-10-22T09:30:00Z") });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = (await extractTextFromFile(pdf, "application/pdf")).replace(/\s+/g, " ");
    for (const expected of [
      "CareTrail",
      "Operations summary",
      "Last 30 days, to 22 Oct 2026, 15:00",
      "Times in India time",
      "93%",
      "27 of 29 calls; 2 handed to a person",
      "87%",
      "€11,241",
      "found above the reference tariff",
      "€6,314",
      "34% average saving on reviewed bills",
      "€27,400",
      "3 decisions waiting for a person",
      "2 hospital bill reviews to accept · 1 escalated case",
      "18 cases",
      "10 claims",
      "Night shift: 19 Oct 2026, 22:30 to 20 Oct 2026, 10:30",
      "emergencies put through to a doctor",
      "Languages served in the period: English, German, Spanish, Turkish",
      "People stay in charge",
      "Powered by Sthiram",
    ]) {
      expect(text).toContain(expected);
    }
    expect(text.match(/Operations summary/g)?.length).toBe(1);
  });

  it("names the file by period and date", () => {
    expect(overviewPdfName(30, "2026-10-22")).toBe("caretrail-operations-summary-30-days-2026-10-22.pdf");
  });
});
