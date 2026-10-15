import i18n, { type InitOptions, type TOptions } from "i18next";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import {
  DEFAULT_LOCALE,
  i18nextResources,
  isSelectableLocale,
  supportedLocales,
  type SelectableLocale,
} from "./locales";

/**
 * Browser cache of the signed-in user's language. The server-side user
 * preference is the source of truth (see useLocalePreferenceSync); this copy
 * only avoids an English flash on reload before the preference loads.
 */
export const LOCALE_STORAGE_KEY = "paperclip:locale";

function readStoredLocale(): SelectableLocale {
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return isSelectableLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function applyDocumentLanguage(locale: string) {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

const initialLocale = readStoredLocale();

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});
applyDocumentLanguage(initialLocale);

export function t(key: string, options: TOptions = {}): string {
  return String(i18n.t(key, options));
}

/** Switch the UI language and remember it in this browser. */
export function setLocale(locale: SelectableLocale) {
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable (private mode); the server preference still applies.
  }
  applyDocumentLanguage(locale);
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
}

export function currentLocale(): SelectableLocale {
  return isSelectableLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
}

export const useTranslation = useReactI18nextTranslation;
export { i18n };
export { COMPLETE_LOCALES, LOCALE_DISPLAY_NAMES, isSelectableLocale, type SelectableLocale } from "./locales";
