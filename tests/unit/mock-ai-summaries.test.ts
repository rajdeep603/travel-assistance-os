import { describe, expect, it } from "vitest";
import { MockAIService } from "@/lib/services/ai/mock";
import type { ChatMessage, ConversationSummaryContext } from "@/lib/services/types";

// Offline call summaries: what the call achieved first, in a sentence or
// three a case manager can read at a glance — never a list of quotes.

const ai = new MockAIService();
const caller = (text: string): ChatMessage => ({ role: "user", text, at: "2026-10-16T09:00:00Z" });
const agent = (text: string): ChatMessage => ({ role: "agent", text, at: "2026-10-16T09:00:05Z" });
const summarize = (messages: ChatMessage[], context?: ConversationSummaryContext) =>
  ai.summarizeConversation(messages, context);

const sentences = (s: string) => s.split(/(?<=[.?])\s+(?=[A-Z])/).length;

describe("MockAIService: call summaries from the outcome", () => {
  it("leads with the triage and the booking, with its references", async () => {
    const summary = await summarize([caller("I have some mild breathing difficulty"), agent("I can book you a doctor.")], {
      channel: "PHONE",
      direction: "inbound",
      status: "COMPLETED",
      outcome: {
        caseRef: "CASE-1032",
        urgency: "MEDIUM",
        issue: "Mild breathing difficulty",
        location: "Istanbul",
        appointmentRef: "APT-2026-1014",
        appointment: { date: "2026-10-17", time: "14:00", specialty: "General Medicine", doctor: "Dr. Demir" },
        endReason: "call ended",
      },
    });
    expect(summary).toBe(
      "Traveller reported mild breathing difficulty in Istanbul; triaged as non-urgent and booked a general physician for Sat 17 Oct at 14:00 (APT-2026-1014, case CASE-1032)."
    );
  });

  it("states the coverage answer with the claims-team caveat", async () => {
    const summary = await summarize([caller("Is my flight delay covered?")], {
      outcome: { coverageChecked: { policy: "POL-TR-100945", benefit: "TRIP_DELAY", covered: true } },
    });
    expect(summary).toBe(
      "Caller asked whether a trip delay is covered; verified policy POL-TR-100945 — it is covered (claims team decides)."
    );
  });

  it("flags emergencies, the 112 advice and the transfer", async () => {
    const summary = await summarize(
      [caller("I have a terrible chest pain"), agent("Please call 112 now. I'm connecting you to our on-call doctor.")],
      { status: "TRANSFERRED", outcome: { handoff: { target: "doctor", reason: "possible cardiac emergency" } } }
    );
    expect(summary).toBe("Emergency: caller reported chest pain; advised to call 112 and transferred to the on-call doctor.");
  });

  it("says when a transfer wasn't possible, or wasn't answered", async () => {
    const browser = await summarize([caller("I want to speak to a person")], {
      channel: "BROWSER",
      status: "COMPLETED",
      outcome: { handoff: { target: "case_manager", reason: "Caller asked for a human" } },
    });
    expect(browser).toBe("Passed to a case manager for a call-back (caller asked for a human).");

    const unanswered = await summarize([caller("chest pain")], {
      status: "TRANSFERRED",
      outcome: { caseRef: "CASE-1041", urgency: "CRITICAL", issue: "Chest pain", handoff: { target: "doctor" }, transferFailed: "no-answer" },
    });
    expect(unanswered).toContain("could not reach the on-call doctor, so an urgent call-back was flagged (case CASE-1041)");
  });

  it("summarises outbound updates for the case", async () => {
    const outbound: ConversationSummaryContext = {
      direction: "outbound",
      audience: "provider",
      agentLabel: "Hospital coordination (Turkish)",
      caseRef: "CASE-1024",
      patientName: "Aylin Yilmaz",
      language: "tr",
    };
    const update = await summarize([caller("Evet, hasta yatırıldı.")], {
      ...outbound,
      outcome: {
        hospitalUpdate: {
          admitted: true,
          ward: "Cardiology 3B",
          attending_doctor: "Dr. Kaya",
          estimated_cost: 85000,
          currency: "TRY",
          guarantee_requested: true,
        },
      },
    });
    expect(update).toBe(
      "Hospital confirmed Aylin Yilmaz is admitted to Cardiology 3B under Dr. Kaya; estimated cost 85,000 TRY and they asked for a Letter of Guarantee (case CASE-1024)."
    );

    const voicemail = await summarize([agent("Hello, this is the assistance company…")], {
      ...outbound,
      audience: "traveller",
      agentLabel: "Appointment reminder",
      status: "VOICEMAIL",
      outcome: { answeredBy: "machine_end_beep" },
    });
    expect(voicemail).toBe("Appointment reminder call to Aylin Yilmaz (case CASE-1024) reached voicemail; left a short message.");

    const followup = await summarize([caller("I feel worse today")], {
      ...outbound,
      audience: "traveller",
      agentLabel: "Wellbeing follow-up",
      outcome: { followup: { attended: true, status: "worse", new_symptoms: "Dizziness" } },
    });
    expect(followup).toBe("Aylin Yilmaz attended the visit and feels worse, with new symptoms (dizziness) — case escalated (case CASE-1024).");
  });

  it("summarises an interpreted call from the case manager's side", async () => {
    const summary = await summarize(
      [
        caller("Hello, can you confirm whether Mr. Yilmaz has been admitted?"),
        caller("[Turkish] Merhaba, Bay Yılmaz'ın yatışının yapıldığını teyit edebilir misiniz?"),
        agent("Evet, yatırıldı."),
        agent("[English] Yes, he was admitted."),
      ],
      { agentId: "interpreter", language: "English ⇄ Turkish", caseRef: "CASE-1024", patientName: "Mehmet Yilmaz" }
    );
    expect(summary).toBe(
      "Case manager spoke with the hospital about Mehmet Yilmaz (case CASE-1024) through the live English ⇄ Turkish interpreter over 2 turns. The case manager asked the hospital to confirm whether Mr. Yilmaz has been admitted."
    );
  });
});

describe("MockAIService: call summaries without an outcome", () => {
  it("paraphrases the first real request instead of quoting the caller", async () => {
    const messages: ChatMessage[] = [caller("Yeah, so"), caller("I need help in apartment booking.")];
    for (let i = 0; i < 37; i++) messages.push(i % 2 ? caller("Uh, okay.") : agent("I can only help with medical needs."));
    const summary = await summarize(messages, { channel: "BROWSER", status: "COMPLETED", outcome: { endReason: "caller hung up" } });
    expect(summary).toBe("Caller asked for help with apartment booking. Nothing was booked or escalated.");
    expect(summary).not.toMatch(/[“”"]|turns|Yeah/);
  });

  it("reports requests and statements in the third person", async () => {
    expect(await summarize([caller("Hello? Could you please book me a dentist for tomorrow")])).toBe(
      "Caller asked the assistant to book them a dentist for tomorrow. Nothing was booked or escalated."
    );
    expect(await summarize([caller("Um, I lost my passport at the airport.")])).toBe(
      "Caller said they lost their passport at the airport. Nothing was booked or escalated."
    );
    expect(await summarize([caller("My son has a fever and we are staying in Kadıköy")])).toBe(
      "Caller described a fever or infection in Kadikoy, Istanbul. Nothing was booked or escalated."
    );
  });

  it("stays short and neutral when there is nothing to go on", async () => {
    expect(await summarize([caller("Hello?"), caller("Uh, yeah"), caller("Can you hear me?")], { channel: "PHONE" })).toBe(
      "The call ended before the caller stated a request."
    );
    expect(await summarize([caller("Merhaba, bir doktora ihtiyacım var, hastane için yardım lütfen")])).toBe(
      "Caller spoke Turkish. Nothing was booked or escalated."
    );
  });

  it("never runs past three sentences", async () => {
    const summary = await summarize(
      [caller("I fell and hurt my ankle. Also, is my hospital stay covered?")],
      {
        outcome: {
          caseRef: "CASE-1050",
          urgency: "HIGH",
          issue: "Ankle injury after a fall",
          appointmentRef: "APT-2026-1050",
          appointment: { date: "2026-10-18", time: "10:00", specialty: "Orthopedics" },
          coverageChecked: { policy: "POL-TR-100944", benefit: "HOSPITALIZATION", covered: true },
          confirmed: "APT-2026-1050",
          endReason: "maximum call length reached",
        },
      }
    );
    expect(sentences(summary)).toBeLessThanOrEqual(3);
    expect(summary.startsWith("Traveller reported ankle injury after a fall; triaged as urgent and booked an orthopaedic doctor")).toBe(true);
  });
});
