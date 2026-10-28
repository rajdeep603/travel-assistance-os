// ---------------------------------------------------------------------------
// Where a lead came from, as the Leads pages and the CSV export name it. No
// database here, so client components can import it.
// ---------------------------------------------------------------------------

export type LeadSourceId = "QUOTATION" | "VISITOR" | "CARD" | "MEETING";

export const LEAD_SOURCE_LABELS: Record<LeadSourceId, string> = {
  QUOTATION: "Quotation",
  VISITOR: "QR page",
  CARD: "Business card",
  MEETING: "Booked meeting",
};

/** "Business card"; an unknown value reads as it is. */
export const leadSourceLabel = (source: string): string => LEAD_SOURCE_LABELS[source as LeadSourceId] ?? source;

/**
 * The show's clock: imported meeting times without an offset are read as
 * Istanbul wall-clock time, where ITIC takes place.
 */
export const MEETING_IMPORT_TIME_ZONE = "Europe/Istanbul";

/** The columns a meetings CSV takes, in the order the template lists them. */
export const MEETING_IMPORT_COLUMNS = ["customerName", "companyName", "email", "phone", "role", "segment", "meetingAt", "brief"] as const;
