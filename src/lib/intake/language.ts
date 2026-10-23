// Lightweight language detection for routing and translation decisions —
// deterministic, so it works offline and costs nothing.

const SIGNALS: [string, RegExp, RegExp][] = [
  ["tr", /[ğışİĞŞ]/, /\b(ve|bir|için|hasta|tarihi|sayın|saygılarımızla|taburcu|tanı|hastane)\b/gi],
  ["de", /[äöüßÄÖÜ]/, /\b(und|der|die|das|ist|nicht|mit|bitte|danke|krankenhaus)\b/gi],
  ["fr", /[éèêàçù]/, /\b(le|la|les|et|est|pour|merci|bonjour|avec|hôpital)\b/gi],
  // Not "hospital": it is English too, and every English invoice says it.
  ["es", /[ñ¿¡]/, /\b(el|la|los|las|y|es|para|gracias|hola|del|con|una)\b/gi],
  ["pt", /[ãõ]/, /\b(não|obrigad[oa]|olá|uma|meu|minha|prezad[oa]s|atenciosamente|garantia|pagamento|você)\b/gi],
  ["ru", /[а-яА-Я]/, /[а-яА-Я]{3,}/g],
  ["ar", /[؀-ۿ]/, /[؀-ۿ]{3,}/g],
];

/** ISO 639-1 code of the dominant language; "en" when nothing else stands out. */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 4000);
  let best = "en";
  let bestScore = 2; // English needs no evidence; others must beat a small threshold
  for (const [code, chars, words] of SIGNALS) {
    const score = (chars.test(sample) ? 2 : 0) + (sample.match(words)?.length ?? 0);
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  return best;
}

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  tr: "Turkish",
  de: "German",
  fr: "French",
  es: "Spanish",
  ru: "Russian",
  ar: "Arabic",
  it: "Italian",
  pt: "Portuguese",
};

/** Patient profile language ("German") → ISO code ("de"). */
export function languageCode(name: string | null | undefined): string {
  const entry = Object.entries(LANGUAGE_NAMES).find(([, n]) => n.toLowerCase() === (name ?? "").toLowerCase());
  return entry ? entry[0] : "en";
}
