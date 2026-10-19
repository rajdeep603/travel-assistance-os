// ---------------------------------------------------------------------------
// What a presenter notes about a meeting on its lead: who they are and what
// hurts, in the words buyers in travel assistance use. The pains are the ones
// a veteran expects to hear; the pilot comes from src/lib/pilots.ts.
// ---------------------------------------------------------------------------

export const LEAD_SEGMENTS = [
  { id: "assistance", label: "Assistance company" },
  { id: "insurer", label: "Large group or insurer" },
  { id: "cost-containment", label: "Cost containment" },
  { id: "hospital", label: "Hospital international desk" },
  { id: "air-ambulance", label: "Air ambulance or repatriation" },
  { id: "partner", label: "Technology partner" },
] as const;

export const LEAD_PAINS = [
  { id: "after-hours", label: "Night shifts and peak call volume" },
  { id: "status-calls", label: "“Where is my case?” calls" },
  { id: "gop-chasing", label: "Hospitals chasing guarantees by phone" },
  { id: "languages", label: "Languages the team doesn't speak" },
  { id: "paperwork", label: "E-mails, faxes and paperwork" },
  { id: "overbilling", label: "Overbilling and bill review" },
  { id: "exposure", label: "Open guarantees and exposure" },
  { id: "repatriation", label: "Repatriation and medical transport" },
  { id: "client-reporting", label: "Reporting to insurer clients" },
  { id: "integration", label: "Fitting with the current system" },
  { id: "growth", label: "Growing without adding staff" },
] as const;

export type LeadSegment = (typeof LEAD_SEGMENTS)[number]["id"];
export type LeadPain = (typeof LEAD_PAINS)[number]["id"];

export const segmentLabel = (id: string | null | undefined): string | null => LEAD_SEGMENTS.find((s) => s.id === id)?.label ?? null;
export const painLabel = (id: string): string | null => LEAD_PAINS.find((p) => p.id === id)?.label ?? null;
