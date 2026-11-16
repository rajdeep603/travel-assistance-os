import { LANGUAGE_NAMES } from "./language";

/**
 * One-paragraph summary of an inbound e-mail or fax, as the inbox shows it:
 * "E-mail from … about CASE-1020. 1 document: discharge summary. Filed on claim CLM-10245."
 */
const CHANNEL_NAME = { EMAIL: "E-mail", FAX: "Fax", WHATSAPP: "WhatsApp message" } as const;

/** "Name <address>" → the address alone when the name is in another script (Arabic in an English sentence reads out of order). */
function sender(from: string): string {
  const m = from.match(/^(.*)<([^>]+)>\s*$/);
  if (!m) return from;
  return /^[\x20-\x7E\u00C0-\u024F]*$/.test(m[1]) ? from : m[2].trim();
}

export function intakeSummary(input: {
  channel: "EMAIL" | "FAX" | "WHATSAPP";
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
    `${CHANNEL_NAME[input.channel]} from ${sender(input.from)} ${input.caseRef ? `about ${input.caseRef}` : "with no confident case match"}.`,
    kinds.length ? `${kinds.length === 1 ? "1 document" : `${kinds.length} documents`}: ${kinds.join(", ")}.` : "No documents.",
    input.claimRef ? `Filed on claim ${input.claimRef}.` : "",
    input.language !== "en" ? `Written in ${LANGUAGE_NAMES[input.language] ?? input.language}.` : "",
    ...input.actions.map(sentence),
  ]
    .filter(Boolean)
    .join(" ");
}
