// ---------------------------------------------------------------------------
// Languages an operator can start a voice session in. Every agent detects
// and follows the caller's language anyway; choosing one makes the agent
// open in it (a Spanish greeting for a Spanish-speaking visitor) and tunes
// recognition. Each entry was tried end to end with scripts/voice-probe.ts.
// ---------------------------------------------------------------------------

export interface VoiceLanguage {
  /** ISO 639 code, also the recogniser's language hint unless `hint` says otherwise. */
  code: string;
  /** The recogniser's hint when it differs from `code`; null lets it detect the language. */
  hint?: string | null;
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
  { code: "zh", name: "Mandarin", native: "普通话" },
  { code: "yue", name: "Cantonese", native: "廣東話", hint: null },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "tl", name: "Tagalog", native: "Tagalog" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "sr", name: "Serbian", native: "Srpski" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "fa", name: "Persian", native: "فارسی" },
  { code: "ur", name: "Urdu", native: "اردو" },
  // The Western Balkans, South-East Europe and Southern Africa (Albanian,
  // Macedonian and Afrikaans probed with typed turns: macOS has no voice for them).
  { code: "sq", name: "Albanian", native: "Shqip" },
  { code: "mk", name: "Macedonian", native: "Македонски" },
  { code: "bg", name: "Bulgarian", native: "Български" },
  { code: "hr", name: "Croatian", native: "Hrvatski" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "af", name: "Afrikaans", native: "Afrikaans" },
];

/** The language by English name or code, case-insensitively. */
export function voiceLanguage(nameOrCode: string | null | undefined): VoiceLanguage | null {
  const key = (nameOrCode ?? "").trim().toLowerCase();
  if (!key) return null;
  return VOICE_LANGUAGES.find((l) => l.code === key || l.name.toLowerCase() === key) ?? null;
}
