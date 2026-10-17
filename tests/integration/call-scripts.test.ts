import { describe, expect, it } from "vitest";
import { HOTLINE_SCRIPTS } from "@/lib/voice/call-scripts";
import { getAgent } from "@/lib/voice/agents/registry";
import { executeTool } from "@/lib/voice/tools/registry";
import type { ToolContext } from "@/lib/voice/tools/types";

// The Call Center's hotline scripts promise answers from seeded records.
// Each test runs the hotline agent's own tools with what the script has the
// presenter say, so a reseed or a tool change can't quietly break a script.

const hotline = getAgent("inbound-hotline")!;

function call() {
  const ctx: ToolContext = {
    callId: "script-test",
    callRef: "CALL-SCRIPT",
    conversationId: "script-test",
    profileId: hotline.id,
    channel: "PHONE",
    caseId: null,
    patientId: null,
    async setCase(id, patientId) {
      ctx.caseId = id;
      ctx.patientId = patientId;
    },
    async setOutcome() {},
    emit() {},
    actions: {
      async hangup() {},
      async transfer() {
        return { ok: false, message: "" };
      },
    },
  };
  return (name: string, args: unknown) => executeTool(name, args, ctx, hotline.tools);
}

const script = (id: string) => {
  const s = HOTLINE_SCRIPTS.find((x) => x.id === id);
  if (!s) throw new Error(`no script ${id}`);
  return { ...s, said: s.turns.map((t) => t.say).join(" "), heard: s.turns.map((t) => t.hear).join(" ") };
};

describe("hotline call scripts", () => {
  it("flight delay: the Premier policy pays €100 for thirteen hours", async () => {
    const s = script("flight-delay");
    expect(s.said).toContain("POL-TR-100945");
    expect(s.said).toContain("2nd of November 1979");
    expect(s.heard).toContain("€100");
    const result = await call()("check_coverage", { policy_number: "POL-TR-100945", date_of_birth: "1979-11-02", benefit: "flight delay", delay_hours: 13 });
    expect(result).toMatchObject({ verified: true, plan: "Premier", benefit: { covered: true }, payout: { amount: 100, currency: "EUR" } });
  });

  it("where is my case: Carlos Garcia's open case is CASE-1015", async () => {
    const s = script("where-is-my-case");
    expect(s.said).toContain("Carlos Garcia");
    expect(s.said).toContain("30th of April 1973");
    const result = await call()("find_my_case", { full_name: "Carlos Garcia", date_of_birth: "1973-04-30" });
    expect(result).toMatchObject({ found: true, case_ref: "CASE-1015" });
  });

  it("claim: CLM-10241 is waiting for the proof of payment", async () => {
    const result = await call()("get_claim_status", { claim_ref: "CLM-10241" });
    expect(result).toMatchObject({ found: true, outstanding: ["Proof of payment missing"] });
    expect(script("claim-status").heard).toMatch(/proof of payment/i);
  });

  it("hospital: Marmara finds Lena Koch's LOG-0902 for €11,850", async () => {
    const s = script("hospital-guarantee");
    expect(s.said).toContain("Marmara Heart Center");
    expect(s.said).toContain("29th of July 1964");
    const result = await call()("find_guarantee", { hospital: "Marmara Heart Center", patient_name: "Lena Koch", date_of_birth: "1964-07-29" });
    expect(JSON.stringify(result)).toContain("LOG-0902");
    expect(JSON.stringify(result)).toMatch(/11,?850/);
  });

  it("booking: Sophie Martin's policy is on file, and Taksim has doctors", async () => {
    const s = script("book-doctor");
    expect(s.said).toContain("POL-TR-100947");
    const result = await call()("check_coverage", { policy_number: "POL-TR-100947", date_of_birth: "1992-05-21" });
    expect(result).toMatchObject({ verified: true });
  });

  it("every script has lines to say and what to hear back", () => {
    for (const s of HOTLINE_SCRIPTS) {
      expect(s.turns.length).toBeGreaterThan(0);
      for (const t of s.turns) {
        expect(t.say.length).toBeGreaterThan(5);
        expect(t.hear.length).toBeGreaterThan(5);
      }
    }
  });
});
