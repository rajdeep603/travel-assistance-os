// ---------------------------------------------------------------------------
// Languages an operator can start a voice session in. Every agent detects
// and follows the caller's language anyway; choosing one makes the agent
// open in it (a Spanish greeting for a Spanish-speaking visitor) and tunes
// recognition. Each entry was tried end to end with scripts/voice-probe.ts.
// ---------------------------------------------------------------------------

export interface VoiceLanguage {
  /** ISO 639-1, also the recogniser's language hint. */
  code: string;
  /** English name: stored on the call and given to the agent. */
  name: string;
  /** What a speaker calls it, for the picker. */
  native: string;
}

export const VOICE_LANGUAGES: VoiceLanguage[] = [
  { code: "en", name: "English", native: "English" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "fr", name: "French", native: "Français" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "no", name: "Norwegian", native: "Norsk" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
];

/** The language by English name or code, case-insensitively. */
export function voiceLanguage(nameOrCode: string | null | undefined): VoiceLanguage | null {
  const key = (nameOrCode ?? "").trim().toLowerCase();
  if (!key) return null;
  return VOICE_LANGUAGES.find((l) => l.code === key || l.name.toLowerCase() === key) ?? null;
}
