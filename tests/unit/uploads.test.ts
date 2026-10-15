import { describe, expect, it } from "vitest";
import { sniffType } from "@/lib/uploads";
import { isUniqueViolation } from "@/lib/refs";
import { Prisma } from "@prisma/client";

describe("upload type sniffing", () => {
  it("recognises PDFs by their bytes, not their name", () => {
    expect(sniffType(Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj"))).toBe("application/pdf");
  });

  it("accepts UTF-8 text and rejects binary", () => {
    expect(sniffType(Buffer.from("Hasta: Aylin Yılmaz\nTanı: gastrit"))).toBe("text/plain");
    expect(sniffType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a]))).toBeNull();
  });
});

describe("unique-violation detection", () => {
  const p2002 = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target },
    });

  it("matches the violated field", () => {
    expect(isUniqueViolation(p2002(["ref"]), "ref")).toBe(true);
    expect(isUniqueViolation(p2002("Appointment_ref_key"), "ref")).toBe(true);
    expect(isUniqueViolation(p2002("Appointment_provider_slot_live_key"), "ref")).toBe(false);
    expect(isUniqueViolation(p2002(["providerId", "scheduledAt"]))).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });
});
