import { BRAND } from "@/lib/brand";

// What the family is told at each step of a case (src/lib/services/family-updates.ts).
// Pure, so the seed writes the same words the live updates use.

export type FamilyMilestone = "opened" | "guarantee" | "closed";

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "there";

/** What the family is told at each step (English; the case's language later). */
export function familyUpdateText(
  milestone: FamilyMilestone,
  c: { ref: string; contactName: string | null; patientFirstName: string; hospital?: string | null; letterRef?: string | null }
): string {
  switch (milestone) {
    case "opened":
      return `Hello ${firstName(c.contactName)}, this is the ${BRAND.name} assistance team about ${c.patientFirstName}. We have opened case ${c.ref}${c.hospital ? ` and are in touch with ${c.hospital}` : ""}. We will message you here at each step.`;
    case "guarantee":
      return `${c.hospital ?? "The hospital"} has our guarantee of payment${c.letterRef ? ` (${c.letterRef})` : ""}, so ${c.patientFirstName} won't be asked for a deposit. Next: the doctors' report. Case ${c.ref}.`;
    case "closed":
      return `Case ${c.ref} for ${c.patientFirstName} is now closed. If you need us again, call the assistance line any time, day or night.`;
  }
}
