import type { UsageDisplayMode } from "@paperclipai/shared";
import { cn } from "@/lib/utils";
import { useTranslation } from "../../i18n";
import { useUserPreferences } from "../../hooks/useUserPreferences";

const MODES: UsageDisplayMode[] = ["tokens", "costs", "both"];

/**
 * Tokens / Costs / Both switch. Saves the choice as the user's preference, so
 * Dashboard and Costs stay in sync across devices.
 */
export function UsageDisplayToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { usageDisplay, update } = useUserPreferences();
  return (
    <div
      role="radiogroup"
      aria-label={t("profile.display.usage")}
      className={cn("inline-flex overflow-hidden rounded-md border border-border", className)}
      data-testid="usage-display-toggle"
    >
      {MODES.map((mode, i) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={usageDisplay === mode}
          className={cn(
            "px-2.5 py-1 text-xs transition-colors",
            i > 0 && "border-l border-border",
            usageDisplay === mode ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-accent",
          )}
          onClick={() => void update({ usageDisplay: mode }).catch(() => undefined)}
        >
          {t(`usage.display.${mode}`)}
        </button>
      ))}
    </div>
  );
}
