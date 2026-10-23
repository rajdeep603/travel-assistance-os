"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { UI_LANGUAGES, UI_LANGUAGE_COOKIE, directionOf, translate, type UiLanguage } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// The interface language on the client: a provider seeded from the cookie the
// server rendered with, `<T>` for a translatable string (usable from server
// components too), and the header's picker. Changing it sets the cookie,
// flips the page direction for Arabic and refreshes server-rendered parts.
// ---------------------------------------------------------------------------

interface UiLanguageValue {
  lang: UiLanguage;
  setLang: (lang: UiLanguage) => void;
}

const UiLanguageContext = createContext<UiLanguageValue>({ lang: "en", setLang: () => undefined });

export function UiLanguageProvider({ initial, children }: { initial: UiLanguage; children: React.ReactNode }) {
  const router = useRouter();
  const [lang, setLangState] = useState<UiLanguage>(initial);

  const setLang = useCallback(
    (next: UiLanguage) => {
      document.cookie = `${UI_LANGUAGE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      setLangState(next);
      router.refresh();
    },
    [router]
  );

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = directionOf(lang);
  }, [lang]);

  return <UiLanguageContext.Provider value={{ lang, setLang }}>{children}</UiLanguageContext.Provider>;
}

export const useUiLanguage = () => useContext(UiLanguageContext);

/** A translator for the current interface language. */
export function useT(): (text: string) => string {
  const { lang } = useUiLanguage();
  return useCallback((text: string) => translate(text, lang), [lang]);
}

/**
 * A string in the interface language (English when it has no translation).
 * `keepHyphenated` stops narrow layouts breaking "e-mail" into "e-" and "mail".
 */
export function T({ children, keepHyphenated = false }: { children: string; keepHyphenated?: boolean }) {
  const text = useT()(children);
  if (!keepHyphenated) return <>{text}</>;
  return (
    <>
      {text.split(/(\S+-\S+)/).map((part, i) =>
        i % 2 ? (
          <span key={i} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}

/** The header's interface-language picker. */
export function UiLanguageSwitch() {
  const { lang, setLang } = useUiLanguage();
  const t = useT();
  return (
    <label className="relative inline-flex items-center" title={t("Interface language")}>
      <Languages size={16} className="pointer-events-none absolute left-2.5 text-muted" aria-hidden />
      <select
        aria-label={t("Interface language")}
        value={lang}
        onChange={(e) => setLang(e.target.value as UiLanguage)}
        className="h-9 rounded-lg border border-line bg-surface py-1 pl-8 pr-7 text-sm font-medium text-ink shadow-sm"
      >
        {UI_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}
