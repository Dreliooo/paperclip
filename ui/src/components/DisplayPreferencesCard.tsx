import { useId } from "react";
import { Languages, LoaderCircle } from "lucide-react";
import type { UsageDisplayMode } from "@paperclipai/shared";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  COMPLETE_LOCALES,
  LOCALE_DISPLAY_NAMES,
  currentLocale,
  isSelectableLocale,
  setLocale,
  useTranslation,
} from "../i18n";
import { useUserPreferences } from "../hooks/useUserPreferences";

const USAGE_MODES: UsageDisplayMode[] = ["tokens", "costs", "both"];

/**
 * Personal display preferences, saved per user on the server so they follow
 * the person across companies and devices: UI language and whether usage
 * metrics lead with tokens, money, or both.
 */
export function DisplayPreferencesCard() {
  const { t } = useTranslation();
  const { preferences, usageDisplay, update, saving, error } = useUserPreferences();
  const languageId = useId();
  const selectedLocale = isSelectableLocale(preferences.locale) ? preferences.locale : currentLocale();

  return (
    <Card className="block space-y-6 p-6" data-testid="display-preferences">
      <div className="flex items-center gap-2">
        <Languages className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">{t("profile.display.title")}</h2>
        {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label={t("common.saving")} /> : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={languageId}>{t("profile.display.language")}</Label>
          <NativeSelect
            id={languageId}
            value={selectedLocale}
            onChange={(event) => {
              const next = event.target.value;
              if (!isSelectableLocale(next)) return;
              setLocale(next);
              void update({ locale: next }).catch(() => undefined);
            }}
          >
            {COMPLETE_LOCALES.map((locale) => (
              <option key={locale} value={locale} lang={locale}>
                {LOCALE_DISPLAY_NAMES[locale]}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">{t("profile.display.languageHint")}</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("profile.display.usage")}</legend>
          <div className="flex overflow-hidden rounded-md border border-border" role="radiogroup" aria-label={t("profile.display.usage")}>
            {USAGE_MODES.map((mode, i) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={usageDisplay === mode}
                className={cn(
                  "flex-1 px-3 py-1.5 text-sm transition-colors",
                  i > 0 && "border-l border-border",
                  usageDisplay === mode ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-accent",
                )}
                onClick={() => void update({ usageDisplay: mode }).catch(() => undefined)}
              >
                {t(`usage.display.${mode}`)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t(`profile.display.usageHint.${usageDisplay}`)}</p>
        </fieldset>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {t("profile.display.saveFailed", { message: error instanceof Error ? error.message : String(error) })}
        </p>
      ) : null}
    </Card>
  );
}
