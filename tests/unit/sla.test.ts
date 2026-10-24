import { describe, expect, it } from "vitest";
import { caseServiceLevels, formatSlaDuration, type SlaInput } from "@/lib/sla";

// Service levels on a case, measured the way an insurer audits them.

const at = (hhmm: string, day = 23) => new Date(`2026-10-${day}T${hhmm}:00Z`);
const base: SlaInput = { openedAt: at("15:49"), assistanceType: "HOSPITALIZATION", status: "IN_PROGRESS", calls: [], letters: [], events: [] };

describe("case service levels", () => {
  it("times the call, the hospital contact and the guarantee (CASE-1024)", () => {
    const sla = caseServiceLevels(
      {
        ...base,
        calls: [
          { ref: "CALL-0913", direction: "INBOUND", startedAt: at("15:47"), answeredAt: new Date(at("15:47").getTime() + 1000) },
          { ref: "CALL-0914", direction: "OUTBOUND", startedAt: at("17:05"), answeredAt: null },
        ],
        letters: [{ ref: "LOG-0903", status: "SENT", createdAt: at("17:24"), sentAt: new Date(at("17:24").getTime() + 23_000) }],
      },
      at("20:00")
    );
    expect(sla.map((m) => [m.key, m.state, m.ref])).toEqual([
      ["answer", "met", "CALL-0913"],
      ["hospital", "met", "CALL-0914"],
      ["guarantee", "met", "LOG-0903"],
    ]);
    expect(formatSlaDuration(sla[1].seconds)).toBe("1 h 16 min");
    expect(formatSlaDuration(sla[2].seconds)).toBe("23 s");
  });

  it("runs the clock on a guarantee waiting for a person, and flags it once past target", () => {
    const letters = [{ ref: "LOG-0904", status: "DRAFT", createdAt: at("19:24", 24), sentAt: null }];
    const input = { ...base, assistanceType: "MEDICAL", openedAt: at("10:30", 22), letters };
    expect(caseServiceLevels(input, at("20:00", 24)).find((m) => m.key === "guarantee")?.state).toBe("running");
    expect(caseServiceLevels(input, at("23:30", 24)).find((m) => m.key === "guarantee")?.state).toBe("overdue");
  });

  it("doesn't call an old case overdue for steps handled off-system", () => {
    const sla = caseServiceLevels({ ...base, openedAt: at("06:30", 13) }, at("20:00", 24));
    expect(sla).toEqual([]);
  });

  it("times an outpatient appointment from the case opening", () => {
    const sla = caseServiceLevels(
      { ...base, assistanceType: "MEDICAL", openedAt: at("05:50"), events: [{ type: "APPOINTMENT", title: "Appointment APT-2026-1007 booked", createdAt: at("06:07") }] },
      at("08:00")
    );
    expect(sla).toEqual([expect.objectContaining({ key: "appointment", state: "met", seconds: 17 * 60 })]);
  });
});

describe("which cases are timed for hospital contact", () => {
  const opened = new Date("2026-10-22T10:30:00Z");
  const letter = (hoursLater: number) => ({ ref: "LOG-0904", status: "DRAFT", createdAt: new Date(opened.getTime() + hoursLater * 3_600_000), sentAt: null });

  it("leaves out a planned operation the hospital asked to guarantee days later", () => {
    const sla = caseServiceLevels({ ...base, assistanceType: "MEDICAL", openedAt: opened, letters: [letter(57)] }, new Date("2026-10-24T20:00:00Z"));
    expect(sla.map((m) => m.key)).toEqual(["guarantee"]);
  });

  it("times urgent care where a guarantee was asked for the same day", () => {
    const sla = caseServiceLevels({ ...base, assistanceType: "MEDICAL", openedAt: opened, letters: [{ ...letter(2), status: "SENT", sentAt: new Date(opened.getTime() + 2.25 * 3_600_000) }] }, new Date("2026-10-24T20:00:00Z"));
    expect(sla.find((m) => m.key === "hospital")).toMatchObject({ state: "missed", ref: "LOG-0904" });
  });
});
