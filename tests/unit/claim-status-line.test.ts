import { beforeEach, describe, expect, it, vi } from "vitest";

// The claim status line: members, providers and brokers each verified their
// own way, each told only what they may hear, in any language.

const outcome: Record<string, unknown> = {};
vi.mock("@/lib/db", () => ({
  prisma: { call: { findUnique: async () => ({ outcome }) } },
}));

const { claimStatusLineAgent } = await import("@/lib/voice/agents/claim-status");
const { getAgent, listAgents } = await import("@/lib/voice/agents/registry");
const { realtimeTools } = await import("@/lib/voice/tools/registry");
const { toolChipLabel } = await import("@/lib/voice/tool-labels");
const { codeMatches, organisationMatches, recordStatusEnquiryTool, verifyClaimCallerTool, viewFor } = await import("@/lib/voice/tools/claim-status");
const { statusViews } = await import("@/lib/services/claim-status");
import type { ClaimStatusFacts } from "@/lib/services/claim-status";
import type { ToolContext } from "@/lib/voice/tools/types";

const bali: ClaimStatusFacts = {
  ref: "GEM-240351",
  member: "Jack Morrison",
  dob: "1990-07-22",
  policy_number: "SCT-8812-2026",
  provider: "Rumah Sakit Kuta Medika Demo, Denpasar",
  broker: { name: "Coral Coast Insurance Brokers (demo)", code: "CCB-2290" },
  treatment: "Wrist fracture after a motorbike accident, surgery",
  amount: "IDR 96,750,000",
  documents_received: ["medical report", "itemised invoice"],
  documents_missing: [],
  for_member: { status: "Invoiced to the insurer.", next_step: "Nothing." },
  for_provider: { status: "The invoice went to the insurer on 6 November; payment to the hospital is expected by 20 November.", next_step: "Nothing; the remittance follows.", payment_expected: "20 November 2026" },
  for_broker: { status: "Invoiced to the insurer; payment expected by 20 November.", next_step: "Nothing." },
};
const jakarta: ClaimStatusFacts = {
  ref: "GEM-240346",
  member: "Budi Santoso",
  dob: "1981-02-14",
  policy_number: "NLI-5520-2026",
  provider: "Orchard Medical Centre Demo, Singapore",
  broker: { name: "PT Mitra Proteksi Indonesia (demo)", code: "MPI-0417" },
  treatment: "Kidney stone, lithotripsy",
  documents_missing: ["itemised invoice"],
  for_member: { status: "Waiting for the itemised invoice.", next_step: "Nothing." },
  for_provider: { status: "Waiting for your itemised invoice.", next_step: "Please send it." },
  for_broker: { status: "Waiting for the itemised invoice from the hospital.", next_step: "Nothing from you." },
};

let saved: Record<string, unknown> = {};
const ctx = {
  callId: "c1",
  callRef: "CALL-1500",
  conversationId: "x",
  profileId: claimStatusLineAgent.id,
  channel: "PHONE",
  caseId: null,
  patientId: null,
  setCase: async () => undefined,
  setOutcome: async (patch: Record<string, unknown>) => {
    saved = { ...saved, ...patch };
    Object.assign(outcome, patch);
  },
  emit: () => undefined,
  actions: { hangup: async () => undefined, transfer: async () => ({ ok: false, message: "" }) },
} as unknown as ToolContext;

beforeEach(() => {
  for (const k of Object.keys(outcome)) delete outcome[k];
  outcome.brief = { client: "Global Excel", _cases: [bali, jakarta] };
  saved = {};
});

const verify = (args: Record<string, unknown>) => verifyClaimCallerTool.execute(args as never, ctx) as Promise<Record<string, unknown>>;

describe("the claim status line agent", () => {
  it("is listed in CareTrail's pickers as well as placeable through the API, with every tool it names", () => {
    expect(getAgent("inbound-claim-status-line")?.id).toBe("inbound-claim-status-line");
    expect(listAgents().some((a) => a.id === "inbound-claim-status-line")).toBe(true);
    // A client's system places it through the API with its own claims (POST /api/v1/calls allows inbound agents marked api).
    expect(claimStatusLineAgent.api).toBe(true);
    expect(claimStatusLineAgent.apiOnly).toBeUndefined();
    expect(() => realtimeTools(claimStatusLineAgent.tools)).not.toThrow();
    for (const tool of claimStatusLineAgent.tools) expect(toolChipLabel(tool)).not.toMatch(/_/);
  });

  it("answers for the API client in its name, in Bahasa Indonesia among 30+ languages, and keeps the hidden facts out", () => {
    const prompt = claimStatusLineAgent.instructions({
      callRef: "CALL-1500",
      channel: "PHONE",
      today: "2026-11-16",
      weekday: "Monday",
      time: "10:00",
      language: "Indonesian",
      brief: { client: "Global Excel", assistant_name: "Global Excel Assistant", _cases: [bali], _collector_number: "+15555550100" },
    });
    expect(prompt).toContain("You are the Global Excel Assistant, the AI assistant answering the claim status line of Global Excel");
    expect(prompt).toMatch(/more than 30 languages, including Bahasa Indonesia/);
    expect(prompt).toMatch(/Language for this call: Indonesian/);
    expect(prompt).toMatch(/NEVER give a broker medical details/);
    expect(prompt).not.toContain("1990-07-22");
    expect(prompt).not.toContain("GEM-240351");
    expect(prompt).not.toContain("+15555550100");
  });

  it("is Ada on CareTrail's own line, reading CareTrail's claims", () => {
    const prompt = claimStatusLineAgent.instructions({ callRef: "CALL-1501", channel: "BROWSER", today: "2026-11-16", weekday: "Monday", time: "10:00" });
    expect(prompt).toMatch(/You are Ada, the AI assistant answering the claim status line of CareTrail/);
    expect(prompt).toMatch(/the claims are CareTrail's own/);
  });
});

describe("matching who is calling", () => {
  it("knows a hospital by a distinctive word, however it is said", () => {
    expect(organisationMatches("RS Kuta Medika", bali.provider)).toBe(true);
    expect(organisationMatches("Rumah Sakit Kuta Medica Denpasar", bali.provider)).toBe(true);
    expect(organisationMatches("Rumah Sakit Bali Sehat", bali.provider)).toBe(false);
    expect(organisationMatches("the hospital", bali.provider)).toBe(false);
    expect(organisationMatches("Rumah Sakit Denpasar", bali.provider)).toBe(false);
  });

  it("knows a brokerage by its distinctive words, never by the country alone", () => {
    expect(organisationMatches("Mitra Proteksi", "PT Mitra Proteksi Indonesia (demo)")).toBe(true);
    expect(organisationMatches("PT Jaya Indonesia", "PT Mitra Proteksi Indonesia (demo)")).toBe(false);
    expect(organisationMatches("Mitra Sehat", "PT Mitra Proteksi Indonesia (demo)")).toBe(false);
  });

  it("reads broker codes as heard", () => {
    expect(codeMatches("M P I zero four one seven", "MPI-0417")).toBe(true);
    expect(codeMatches("MPI-0417", "MPI-0417")).toBe(true);
    expect(codeMatches("0418", "MPI-0417")).toBe(false);
    expect(codeMatches(undefined, "MPI-0417")).toBe(false);
  });
});

describe("verify_claim_caller", () => {
  it("verifies a member by claim number and date of birth, and gives them everything about their claim", async () => {
    const r = await verify({ caller_type: "member", claim_ref: "G E M two four zero three five one", date_of_birth: "1990-07-22" });
    expect(r.verified).toBe(true);
    expect((r.claim as Record<string, unknown>).treatment).toBe(bali.treatment);
    expect(saved.identity).toMatchObject({ verified: true, case_ref: "GEM-240351", caller_type: "member" });
  });

  it("verifies the Bali hospital calling in Bahasa Indonesia about its payment, and tells it what concerns the payment", async () => {
    const r = await verify({ caller_type: "provider", organisation: "Rumah Sakit Kuta Medika", member_name: "Jack Morrison", date_of_birth: "1990-07-22", caller_name: "Ibu Wayan" });
    expect(r.verified).toBe(true);
    const claim = r.claim as Record<string, unknown>;
    expect(claim.status).toMatch(/expected by 20 November/);
    expect(claim.payment_expected).toBe("20 November 2026");
    expect(claim.patient).toBe("Jack Morrison");
  });

  it("refuses a hospital that isn't the one on the claim, without saying the claim exists", async () => {
    const r = await verify({ caller_type: "provider", organisation: "Siloam Demo Hospital", claim_ref: "GEM-240351", date_of_birth: "1990-07-22" });
    expect(r.verified).toBe(false);
    expect(JSON.stringify(r)).not.toContain("Kuta");
    const again = await verify({ caller_type: "provider", organisation: "Siloam Demo Hospital", claim_ref: "GEM-240351", date_of_birth: "1990-07-22" });
    expect(again.say).toMatch(/say nothing about any claim/);
  });

  it("verifies a broker by code, claim and the member's date of birth or policy number, and gives no medical details", async () => {
    const r = await verify({ caller_type: "broker", broker_code: "M P I nol empat satu tujuh → MPI 0417", organisation: "Mitra Proteksi", member_name: "Budi Santoso", policy_number: "NLI 5520 2026" });
    expect(r.verified).toBe(true);
    const claim = r.claim as Record<string, unknown>;
    expect(claim.status).toMatch(/itemised invoice/);
    expect(claim.treatment).toBeUndefined();
    expect(JSON.stringify(claim)).not.toMatch(/lithotripsy|Kidney/);
    expect(claim.medical_details).toMatch(/Not shared with brokers/);
  });

  it("refuses a broker who isn't on the policy, and one without the member's date of birth or policy number", async () => {
    expect((await verify({ caller_type: "broker", broker_code: "CCB-2290", member_name: "Budi Santoso", date_of_birth: "1981-02-14" })).verified).toBe(false);
    for (const k of Object.keys(outcome)) if (k !== "brief") delete outcome[k];
    expect((await verify({ caller_type: "broker", broker_code: "MPI-0417", member_name: "Budi Santoso", date_of_birth: "1981-02-15" })).verified).toBe(false);
  });

  it("records who called and how it ended", async () => {
    await recordStatusEnquiryTool.execute({ caller_type: "broker", outcome: "status_given", claim_ref: "GEM-240346", organisation: "PT Mitra Proteksi Indonesia", question: "Status of the claim" }, ctx);
    expect(saved.statusEnquiry).toMatchObject({ caller_type: "broker", outcome: "status_given" });
  });
});

describe("what each caller hears from CareTrail's claims", () => {
  it("a claim waiting for a document: the provider is asked for it, the broker hears we chase it", () => {
    const v = statusViews({ status: "INFO_REQUESTED", missing: ["Itemised hospital invoice"], planPays: null, paidOn: null });
    expect(v.for_provider.next_step).toMatch(/Please send the itemised hospital invoice/);
    expect(v.for_broker.next_step).toMatch(/chasing it with the hospital/);
    expect(viewFor({ ...jakarta, ...v }, "broker").treatment).toBeUndefined();
  });

  it("an approved claim tells the provider the amount approved", () => {
    const v = statusViews({ status: "APPROVED", missing: [], planPays: "23,350 TRY", paidOn: null });
    expect(v.for_provider.amount_approved).toBe("23,350 TRY");
    expect(v.for_member.status).toMatch(/plan pays 23,350 TRY/);
  });
});
