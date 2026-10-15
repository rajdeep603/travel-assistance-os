import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { searchProviders } from "@/lib/services/provider-search";
import { bookAppointment } from "@/lib/services/appointment";
import { analyzeRequest, createCaseFromAnalysis } from "@/lib/services/case-intake";
import { reviewClaim, applyClaimAction } from "@/lib/services/claims";
import { askAssistant, retrieveContext } from "@/lib/services/assistant";

// Integration tests run against the seeded demo database (docker-compose.dev).
const prisma = new PrismaClient();

const created = {
  caseIds: [] as string[],
  appointmentIds: [] as string[],
  patientIds: [] as string[],
  conversationIds: [] as string[],
  claimIds: [] as string[],
};

afterAll(async () => {
  // Clean up records created by this run (order matters for FKs).
  await prisma.appointment.deleteMany({ where: { id: { in: created.appointmentIds } } });
  await prisma.conversation.deleteMany({ where: { id: { in: created.conversationIds } } });
  await prisma.claim.deleteMany({ where: { id: { in: created.claimIds } } });
  await prisma.case.deleteMany({ where: { id: { in: created.caseIds } } });
  await prisma.patient.deleteMany({ where: { id: { in: created.patientIds } } });
  await prisma.$disconnect();
});

function futureWeekday(daysAhead = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("Provider search (database)", () => {
  it("matches specialty, language, availability and distance", async () => {
    const results = await searchProviders({
      city: "Istanbul",
      district: "Taksim",
      specialty: "General Medicine",
      date: futureWeekday(),
      timeOfDay: "afternoon",
      language: "English",
      limit: 5,
    });
    expect(results.length).toBeGreaterThan(0);
    const top = results[0];
    expect(["General Medicine"]).toContain(top.provider.specialty);
    expect(top.provider.languages).toContain("English");
    expect(top.slots.length).toBeGreaterThan(0);
    expect(top.reasons.length).toBeGreaterThan(1);
    expect(top.distanceKm).not.toBeNull();
  });

  it("filters out providers without the requested language", async () => {
    const results = await searchProviders({
      city: "Istanbul",
      language: "Russian",
      limit: 10,
    });
    for (const r of results) {
      expect(r.provider.languages.map((l) => l.toLowerCase())).toContain("russian");
    }
  });

  it("excludes slots that are already booked", async () => {
    const date = futureWeekday(10);
    const provider = await prisma.provider.findUniqueOrThrow({ where: { ref: "PRV-2002" } });
    const patient = await prisma.patient.findUniqueOrThrow({ where: { ref: "PAT-1005" } });

    const before = await searchProviders({ city: "Istanbul", specialty: provider.specialty, date, limit: 10 });
    const mine = before.find((r) => r.provider.id === provider.id);
    expect(mine).toBeTruthy();
    const slot = mine!.slots[0];
    expect(slot).toBeTruthy();

    const appointment = await bookAppointment({
      patientId: patient.id,
      providerId: provider.id,
      date: slot.date,
      time: slot.time,
      reason: "integration test booking",
    });
    created.appointmentIds.push(appointment.id);

    const after = await searchProviders({ city: "Istanbul", specialty: provider.specialty, date, limit: 10 });
    const mineAfter = after.find((r) => r.provider.id === provider.id);
    expect(mineAfter?.slots.map((s) => s.time)).not.toContain(slot.time);
  });
});

describe("Appointments (database)", () => {
  it("rejects double-booking the same slot", async () => {
    const provider = await prisma.provider.findUniqueOrThrow({ where: { ref: "PRV-2004" } });
    const patient = await prisma.patient.findUniqueOrThrow({ where: { ref: "PAT-1006" } });
    const date = futureWeekday(12);
    const first = await bookAppointment({
      patientId: patient.id,
      providerId: provider.id,
      date,
      time: "14:00",
      reason: "integration test",
    });
    created.appointmentIds.push(first.id);
    await expect(
      bookAppointment({
        patientId: patient.id,
        providerId: provider.id,
        date,
        time: "14:00",
        reason: "integration test duplicate",
      })
    ).rejects.toThrow(/slot/i);
  });

  it("lets exactly one of several concurrent bookings win a slot", async () => {
    const provider = await prisma.provider.findUniqueOrThrow({ where: { ref: "PRV-2004" } });
    const patient = await prisma.patient.findUniqueOrThrow({ where: { ref: "PAT-1006" } });
    const date = futureWeekday(21);
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        bookAppointment({
          patientId: patient.id,
          providerId: provider.id,
          date,
          time: "14:00",
          reason: `integration race ${i}`,
        })
      )
    );
    const won = attempts.filter((a) => a.status === "fulfilled");
    const lost = attempts.filter((a) => a.status === "rejected");
    for (const a of won) created.appointmentIds.push((a as PromiseFulfilledResult<{ id: string }>).value.id);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(4);
    for (const l of lost) {
      expect((l as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    }
  });

  it("stores Istanbul wall-clock times as the correct UTC instant", async () => {
    const provider = await prisma.provider.findUniqueOrThrow({ where: { ref: "PRV-2004" } });
    const patient = await prisma.patient.findUniqueOrThrow({ where: { ref: "PAT-1006" } });
    const date = futureWeekday(28);
    const apt = await bookAppointment({
      patientId: patient.id,
      providerId: provider.id,
      date,
      time: "14:00",
      reason: "integration timezone check",
    });
    created.appointmentIds.push(apt.id);
    // Istanbul is UTC+3: 14:00 local is 11:00Z, whatever TZ the test host uses.
    expect(apt.scheduledAt.toISOString()).toBe(`${date}T11:00:00.000Z`);
  });

  it("rejects times outside the provider's weekly template", async () => {
    const provider = await prisma.provider.findUniqueOrThrow({ where: { ref: "PRV-2004" } });
    const patient = await prisma.patient.findUniqueOrThrow({ where: { ref: "PAT-1006" } });
    await expect(
      bookAppointment({
        patientId: patient.id,
        providerId: provider.id,
        date: futureWeekday(35),
        time: "03:17",
        reason: "integration off-template",
      })
    ).rejects.toThrow(/no appointment slot/i);
  });
});

describe("Case intake (database)", () => {
  it("creates a real case from an analysed request", async () => {
    const text =
      "My husband is travelling in Istanbul and has developed severe stomach pain. We are staying near Taksim. We need help finding a hospital.";
    const analysis = await analyzeRequest(text);
    const kase = await createCaseFromAnalysis({ requestText: text, analysis });
    created.caseIds.push(kase.id);
    created.patientIds.push(kase.patientId);

    expect(kase.ref).toMatch(/^CASE-\d+$/);
    expect(kase.location).toBe("Taksim, Istanbul");
    expect(kase.priority).toBe("HIGH");
    const found = await prisma.case.findUnique({ where: { ref: kase.ref } });
    expect(found).toBeTruthy();
  });
});

describe("Claims pipeline (database)", () => {
  it("reviews the seeded CLM-10245 and finds the policy number missing", async () => {
    const claim = await prisma.claim.findUniqueOrThrow({ where: { ref: "CLM-10245" } });
    const reviewed = await reviewClaim(claim.id);
    const issues = reviewed.issues as { severity: string; message: string }[];
    expect(issues.some((i) => i.severity === "error" && /policy number/i.test(i.message))).toBe(true);
    expect(issues.some((i) => /invoice available/i.test(i.message))).toBe(true);
    expect(reviewed.summary).toContain("CLM-10245");
  });

  it("applies reviewer actions and records history", async () => {
    const patient = await prisma.patient.findUniqueOrThrow({ where: { ref: "PAT-1009" } });
    const claim = await prisma.claim.create({
      data: { ref: `CLM-T${Date.now() % 100000}`, patientId: patient.id, status: "NEEDS_REVIEW" },
    });
    created.claimIds.push(claim.id);
    const escalated = await applyClaimAction(claim.id, "ESCALATE", "integration test");
    expect(escalated.status).toBe("ESCALATED");
    const history = escalated.history as { action: string }[];
    expect(history[history.length - 1].action).toMatch(/escalated/i);
  });
});

describe("Internal assistant (database)", () => {
  it("retrieves relevant knowledge documents", async () => {
    const chunks = await retrieveContext("What documents are required for a hospitalization case?");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].title).toMatch(/required documents/i);
  });

  it("answers case status questions from the live database", async () => {
    const res = await askAssistant("What is the status of CASE-1024?");
    expect(res.answer).toContain("CASE-1024");
    expect(res.answer).toMatch(/status/i);
    expect(res.sources[0].source).toBe("db/cases");
  });

  it("handles unknown case references gracefully", async () => {
    const res = await askAssistant("What is the status of CASE-99999?");
    expect(res.answer).toMatch(/could not find/i);
  });
});
