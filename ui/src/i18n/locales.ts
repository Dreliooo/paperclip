import type { Resource } from "i18next";

import { assertValidLocaleMessages } from "./locale-validation";

export const DEFAULT_LOCALE = "en" as const;

/**
 * Locales that must translate every English key. Only these are offered in the
 * language selector; the remaining catalogs are partial and fall back to
 * English per key until they are completed.
 */
export const COMPLETE_LOCALES = ["en", "es"] as const;
export type SelectableLocale = (typeof COMPLETE_LOCALES)[number];

/** Endonyms, so each language is recognisable in its own script. */
export const LOCALE_DISPLAY_NAMES: Record<SelectableLocale, string> = {
  en: "English",
  es: "Español",
};

export function isSelectableLocale(value: unknown): value is SelectableLocale {
  return typeof value === "string" && (COMPLETE_LOCALES as readonly string[]).includes(value);
}

const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

export const localeMessages = Object.fromEntries(
  Object.entries(localeModules).map(([path, messages]) => {
    const locale = path.match(/\/([A-Za-z0-9_-]+)\.json$/)?.[1];
    if (!locale) {
      throw new Error(`Invalid locale file path: ${path}`);
    }
    return [locale, messages];
  }),
);

if (!(DEFAULT_LOCALE in localeMessages)) {
  throw new Error(`Missing default locale messages for ${DEFAULT_LOCALE}`);
}

for (const [locale, messages] of Object.entries(localeMessages)) {
  try {
    assertValidLocaleMessages(messages, undefined, {
      allowMissing: !isSelectableLocale(locale),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${locale} locale messages: ${message}`);
  }
}

export const supportedLocales = Object.keys(localeMessages);

export const i18nextResources: Resource = Object.fromEntries(
  Object.entries(localeMessages).map(([locale, messages]) => [locale, { translation: messages }]),
) as Resource;

export type SupportedLocale = keyof typeof localeMessages;
