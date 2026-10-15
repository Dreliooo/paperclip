import type { AgentRunner, AgentRunnerChoice } from "@paperclipai/shared";
import { Field } from "./agent-config-primitives";
import { SelectPopover } from "./ui/select";
import { Button } from "./ui/button";
import { useTranslation } from "@/i18n";

export function CodexRunnerSelect({
  value,
  onChange,
  defaultRunner,
  supportedRunners = ["legacy"],
  disabled,
  pending,
  error,
  onRetry,
}: {
  value: AgentRunnerChoice;
  onChange: (value: AgentRunnerChoice) => void;
  defaultRunner?: AgentRunner;
  supportedRunners?: readonly AgentRunner[];
  disabled?: boolean;
  pending?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const paperclipName = t("ui3g0.codexRunner.paperclipRunner");
  const legacyName = t("ui3g0.codexRunner.legacyRunner");
  const displayValue = value === "auto"
    ? (defaultRunner
      ? t("ui3g0.codexRunner.defaultRunnerLabel", { runner: defaultRunner === "paperclip" ? paperclipName : legacyName })
      : pending ? t("ui3g0.codexRunner.checkingAvailability") : t("ui3g0.codexRunner.automaticUnavailable"))
    : undefined;
  return (
    <Field label={t("ui3g0.codexRunner.label")}>
      <SelectPopover
        aria-label={t("ui3g0.codexRunner.label")}
        disabled={disabled}
        value={value}
        displayValue={displayValue}
        onValueChange={next => onChange(next as AgentRunnerChoice)}
        options={[
          { value: "paperclip", label: defaultRunner === "paperclip" ? t("ui3g0.codexRunner.defaultRunnerLabel", { runner: paperclipName }) : paperclipName, disabled: !supportedRunners.includes("paperclip") && value !== "paperclip" },
          { value: "legacy", label: defaultRunner === "legacy" ? t("ui3g0.codexRunner.defaultRunnerLabel", { runner: legacyName }) : legacyName, disabled: !supportedRunners.includes("legacy") && value !== "legacy" },
        ]}
      />
      {error && <div className="mt-2 space-y-2">
        <p role="alert" className="text-sm text-destructive">{error}</p>
        {onRetry && <Button type="button" variant="outline" size="sm" disabled={pending || disabled} onClick={onRetry}>{t("ui3g0.codexRunner.retryDiscovery")}</Button>}
      </div>}
    </Field>
  );
}
