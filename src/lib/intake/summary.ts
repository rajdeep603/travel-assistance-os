import { LANGUAGE_NAMES } from "./language";

/**
 * One-paragraph summary of an inbound e-mail or fax, as the inbox shows it:
 * "E-mail from … about CASE-1020. 1 document: discharge summary. Filed on claim CLM-10245."
 */
export function intakeSummary(input: {
  channel: "EMAIL" | "FAX";
  from: string;
  caseRef: string | null;
  kinds: string[];
  claimRef: string | null;
  language: string;
  actions: string[];
}): string {
  const sentence = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? "" : "."}`;
  const { kinds } = input;
  return [
    `${input.channel === "EMAIL" ? "E-mail" : "Fax"} from ${input.from} ${input.caseRef ? `about ${input.caseRef}` : "with no confident case match"}.`,
    kinds.length ? `${kinds.length === 1 ? "1 document" : `${kinds.length} documents`}: ${kinds.join(", ")}.` : "No documents.",
    input.claimRef ? `Filed on claim ${input.claimRef}.` : "",
    input.language !== "en" ? `Written in ${LANGUAGE_NAMES[input.language] ?? input.language}.` : "",
    ...input.actions.map(sentence),
  ]
    .filter(Boolean)
    .join(" ");
}
