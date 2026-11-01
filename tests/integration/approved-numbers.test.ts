import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";
import { addApprovedNumber, isAllowedNumber, listApprovedNumbers, removeApprovedNumber } from "@/lib/services/approved-numbers";
import { placeOutboundCall } from "@/lib/services/outbound-calls";

// Numbers AI agents may call: the configured list plus the ones an operator
// approves while the app runs (a prospect's mobile at the booth).

const prisma = new PrismaClient();
const NUMBER = "+905329990001";

describe("approved numbers", () => {
  afterAll(async () => {
    await prisma.approvedNumber.deleteMany({ where: { number: NUMBER } });
    await prisma.$disconnect();
  });

  it("approves a number typed with its country code, offers it after the configured ones, and removes it again", async () => {
    expect(await isAllowedNumber(NUMBER)).toBe(false);
    const added = await addApprovedNumber({ number: "+90 532 999 00 01", label: "Client at the booth", addedBy: "test" });
    expect(added).toMatchObject({ number: NUMBER, label: "Client at the booth", source: "added" });
    expect(added.id).toBeTruthy();
    expect(await isAllowedNumber("+90 (532) 999 00 01")).toBe(true);

    const list = await listApprovedNumbers();
    const configured = env.outboundAllowedNumbers;
    expect(list.slice(0, configured.length).map((n) => n.number)).toEqual(configured);
    expect(list.slice(0, configured.length).every((n) => n.source === "configured" && n.id === null)).toBe(true);
    expect(list.find((n) => n.number === NUMBER)?.source).toBe("added");

    // Approving it again only changes the label.
    const again = await addApprovedNumber({ number: NUMBER, label: "Prospect" });
    expect(again.id).toBe(added.id);
    expect(again.label).toBe("Prospect");

    await removeApprovedNumber(added.id!);
    expect(await isAllowedNumber(NUMBER)).toBe(false);
    expect((await listApprovedNumbers()).some((n) => n.number === NUMBER)).toBe(false);
    await expect(removeApprovedNumber(added.id!)).rejects.toThrow();
  });

  it("refuses a number without a country code", async () => {
    await expect(addApprovedNumber({ number: "0532 999 00 01" })).rejects.toThrow(/country code/);
    await expect(addApprovedNumber({ number: "+1" })).rejects.toThrow(/country code/);
  });

  it("is what outbound calls check: an unapproved number is refused with a hint to approve it", async () => {
    await expect(placeOutboundCall({ profileId: "outbound-payment-followup", to: "+905329990002", placedBy: "test" })).rejects.toThrow(/Approve it first/);
  });
});
