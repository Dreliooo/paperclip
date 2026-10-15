import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { copyTextToClipboard } from "@/lib/clipboard";
import { AgentSetupPrompt } from "@/components/AgentSetupPrompt";
import { useTranslation } from "@/i18n";

export function CopyField({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
        <code title={value} className="min-w-0 flex-1 truncate text-xs">
          {value}
        </code>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("ui3g2.webhookFields.copyLabelAria", { label })}
          onClick={async () => {
            try {
              await copyTextToClipboard(value);
              setCopied(true);
              setError(false);
            } catch {
              setError(true);
            }
          }}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? t("ui3g2.webhookFields.copied") : t("ui3g2.webhookFields.copy")}
        </Button>
      </div>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-destructive">
            {t("ui3g2.webhookFields.copyFailed")}
          </p>
          <textarea
            readOnly
            aria-label={t("ui3g2.webhookFields.textAria", { label })}
            value={value}
            rows={5}
            className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}

export function AgentInstructions({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("ui3g2.webhookFields.agentInstructions")}
      className="space-y-3 rounded-md bg-muted/40 p-4"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{t("ui3g2.webhookFields.agentInstructions")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("ui3g2.webhookFields.agentIntro")}
        </p>
      </div>
      <AgentSetupPrompt
        prompt={value}
        label={t("ui3g2.webhookFields.copyForAgent")}
        title={t("ui3g2.webhookFields.webhookSetup")}
        description={t("ui3g2.webhookFields.webhookSetupDescription")}
      />
    </section>
  );
}
