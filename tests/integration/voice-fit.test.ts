import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getAgent } from "@/lib/voice/agents/registry";
import { DEMO_TRACKS } from "@/lib/voice/demo-runs";
import { PREPARABLE_AGENTS, prepareScenario, prepareScenarios, voiceScenarios } from "@/lib/voice/demo-scenarios";
import { briefWithFit } from "@/lib/voice/fit-note";

// Voice agents start only on a case that gives them something to call about:
// every outbound agent judges a case (`fit`) with the same selection its brief
// uses, each has a pinned demo case that `prepare` puts back into shape, and
// the demo runs resolve to ready cases. Against the seeded database.

const prisma = new PrismaClient();
const OPERATOR = "voice-fit-test";

async function caseByRef(ref: string) {
  return prisma.case.findUniqueOrThrow({ where: { ref }, select: { id: true, ref: true } });
}

describe("voice agents and the cases that fit them", () => {
  beforeAll(async () => {
    await prepareScenarios(PREPARABLE_AGENTS, OPERATOR);
  });

  afterAll(async () => {
    await prisma.caseEvent.deleteMany({ where: { actor: `operator:${OPERATOR}` } });
    await prisma.$disconnect();
  });

  it("gives every case-calling agent a pinned demo case that is ready, briefed on the same record", async () => {
    const scenarios = await voiceScenarios();
    for (const s of scenarios.filter((x) => x.requiresCase)) {
      expect(s.case, s.agentId).not.toBeNull();
      expect(s.fit?.ready, `${s.agentId}: ${s.fit?.why}`).toBe(true);
      expect(s.fit?.record, s.agentId).toBeTruthy();
      expect(s.suggested?.id, s.agentId).toBe(s.case!.id);
      expect(s.canPrepare, s.agentId).toBe(true);
    }

    const reminder = scenarios.find((s) => s.agentId === "outbound-appointment-reminder")!;
    expect(reminder.case?.ref).toBe("CASE-1016");
    expect(reminder.fit?.record).toContain("APT-2026-1009");
    const reminderBrief = await getAgent("outbound-appointment-reminder")!.buildBrief!(reminder.case!.id);
    expect((reminderBrief.appointment as { ref: string }).ref).toBe("APT-2026-1009");

    const claim = scenarios.find((s) => s.agentId === "outbound-claim-missing-info")!;
    expect(claim.case?.ref).toBe("CASE-1021");
    expect(claim.fit?.record).toContain("CLM-10243");
    const claimBrief = await getAgent("outbound-claim-missing-info")!.buildBrief!(claim.case!.id);
    expect(claimBrief.claim).toContain("CLM-10243");
    expect(claimBrief.missing).toContain("Discharge summary missing");

    const log = scenarios.find((s) => s.agentId === "outbound-log-confirmation")!;
    expect(log.case?.ref).toBe("CASE-1024");
    // LOG-0903 from the seed, or a newer letter a rehearsal issued on the case: either is a letter still awaiting confirmation.
    expect(log.fit?.record).toMatch(/^LOG-\d{4} · /);

    const bill = scenarios.find((s) => s.agentId === "outbound-bill-negotiation")!;
    expect(bill.case?.ref).toBe("CASE-1022");
    const billBrief = await getAgent("outbound-bill-negotiation")!.buildBrief!(bill.case!.id);
    expect(billBrief.your_opening_offer).toBeTruthy();

    const payer = scenarios.find((s) => s.agentId === "outbound-payment-followup")!;
    expect(payer.requiresCase).toBe(false);
    expect(payer.case).toBeNull();
    expect(payer.record?.ref).toBe("RCV-0905");
    expect(payer.fit?.ready, payer.fit?.why).toBe(true);
  });

  it("judges every agent on the case the page was opened for, and offers the ready demo case instead", async () => {
    const quiet = await caseByRef("CASE-1018");
    const scenarios = await voiceScenarios({ caseId: quiet.id });
    const mustBeUnfit = [
      "outbound-appointment-reminder",
      "outbound-wellbeing-followup",
      "outbound-claim-missing-info",
      "outbound-log-confirmation",
      "outbound-bill-negotiation",
      "outbound-hospital-coordination",
    ];
    for (const s of scenarios.filter((x) => x.requiresCase)) {
      expect(s.case?.id, s.agentId).toBe(quiet.id);
      expect(s.fit, s.agentId).not.toBeNull();
      if (mustBeUnfit.includes(s.agentId)) {
        expect(s.fit!.ready, s.agentId).toBe(false);
        expect(s.fit!.why.length, s.agentId).toBeGreaterThan(10);
      }
      expect(s.suggested, s.agentId).not.toBeNull();
      expect(s.suggested!.id, s.agentId).not.toBe(quiet.id);
      expect(s.suggested!.fit.ready, `${s.agentId}: ${s.suggested!.fit.why}`).toBe(true);
    }
    // Inbound agents take the case along, with nothing to judge.
    const hotline = scenarios.find((s) => s.agentId === "inbound-hotline")!;
    expect(hotline.case?.id).toBe(quiet.id);
    expect(hotline.fit).toBeNull();
    await expect(voiceScenarios({ caseId: "no-such-case" })).rejects.toThrow();
  });

  it("undoes what a rehearsal consumed: an acknowledged letter is sent again, with the reset on the timeline", async () => {
    const admission = await caseByRef("CASE-1024");
    // Every letter on the case confirmed (a rehearsal may have issued more than the seeded LOG-0903).
    await prisma.guaranteeLetter.updateMany({ where: { caseId: admission.id, status: "SENT" }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() } });
    const before = await getAgent("outbound-log-confirmation")!.fit!(admission.id);
    expect(before.ready).toBe(false);
    expect(before.why).toMatch(/already acknowledged/);

    const prepared = await prepareScenario("outbound-log-confirmation", OPERATOR);
    expect(prepared.case?.ref).toBe("CASE-1024");
    expect(prepared.fit.ready).toBe(true);
    expect((await prisma.guaranteeLetter.findUniqueOrThrow({ where: { ref: "LOG-0903" } })).status).toBe("SENT");
    const event = await prisma.caseEvent.findFirst({ where: { caseId: admission.id, actor: `operator:${OPERATOR}` }, orderBy: { createdAt: "desc" } });
    expect(event?.title).toContain("Demo case reset");
  });

  it("brings a cancelled reminder appointment back to tomorrow, without creating a second one", async () => {
    const eye = await caseByRef("CASE-1016");
    const count = await prisma.appointment.count({ where: { caseId: eye.id } });
    await prisma.appointment.update({ where: { ref: "APT-2026-1009" }, data: { status: "CANCELLED" } });
    expect((await getAgent("outbound-appointment-reminder")!.fit!(eye.id)).ready).toBe(false);
    await prepareScenario("outbound-appointment-reminder", OPERATOR);
    await prepareScenario("outbound-appointment-reminder", OPERATOR);
    const apt = await prisma.appointment.findUniqueOrThrow({ where: { ref: "APT-2026-1009" } });
    expect(apt.status).toBe("PENDING");
    expect(apt.scheduledAt.getTime()).toBeGreaterThan(Date.now());
    expect(await prisma.appointment.count({ where: { caseId: eye.id } })).toBe(count);
  });

  it("forgets an agreed bill rather than billing the case twice", async () => {
    const lena = await caseByRef("CASE-1022");
    const reviews = await prisma.billReview.count({ where: { caseId: lena.id } });
    const review = await prisma.billReview.findFirstOrThrow({ where: { caseId: lena.id, kind: "HOSPITAL_INVOICE", savings: { gt: 0 } }, orderBy: { createdAt: "desc" } });
    await prisma.billReview.update({ where: { id: review.id }, data: { agreement: { outcome: "AGREED" }, agreedAmount: review.recommended } });
    const before = await getAgent("outbound-bill-negotiation")!.fit!(lena.id);
    expect(before.ready).toBe(false);
    expect(before.why).toMatch(/already negotiated/);
    const prepared = await prepareScenario("outbound-bill-negotiation", OPERATOR);
    expect(prepared.fit.ready).toBe(true);
    expect(await prisma.billReview.count({ where: { caseId: lena.id } })).toBe(reviews);
  });

  it("tells an agent why its case doesn't fit instead of leaving it to improvise", () => {
    const unfit = briefWithFit({ claim: "none" }, { ready: false, why: "No open claim on this case.", record: null });
    expect(unfit.note_for_agent).toMatch(/^No open claim on this case\. Say so plainly/);
    expect(briefWithFit({ claim: "CLM-1" }, { ready: true, why: "" })).toEqual({ claim: "CLM-1" });
    expect(briefWithFit({ claim: "CLM-1" }, null)).toEqual({ claim: "CLM-1" });
  });

  it("resolves every demo-run step to a ready case or invoice", async () => {
    for (const track of DEMO_TRACKS) {
      for (const step of track.steps) {
        const profile = getAgent(step.agentId)!;
        if (step.caseRef) {
          const kase = await caseByRef(step.caseRef);
          const fit = await profile.fit!(kase.id);
          expect(fit.ready, `${track.id}/${step.id}: ${fit.why}`).toBe(true);
        } else if (step.record) {
          const fit = await profile.fitRecord!(step.record);
          expect(fit.ready, `${track.id}/${step.id}: ${fit.why}`).toBe(true);
        }
      }
    }
  });
});
