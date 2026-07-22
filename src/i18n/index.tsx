import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import ko from "./ko.json";
import en from "./en.json";

export type Locale = "ko" | "en";

type Dictionary = Record<string, string>;

const dictionaries: Record<Locale, Dictionary> = { ko, en };

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function translate(
  dict: Dictionary,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const template = dict[key] ?? key;
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
    template,
  );
}

const I18nContext = createContext<I18nValue>({
  locale: "ko",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({
  children,
  defaultLocale = "ko",
}: {
  children: ReactNode;
  defaultLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);

  const value = useMemo<I18nValue>(() => {
    const dict = dictionaries[locale];
    return { locale, setLocale, t: (key, vars) => translate(dict, key, vars) };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
