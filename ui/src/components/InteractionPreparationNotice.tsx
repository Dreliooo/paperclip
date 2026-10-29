import { Loader2 } from "lucide-react";
import { useTranslation } from "@/i18n";

export function InteractionPreparationNotice() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
      {t("ui2g4.interactionPreparationNotice.preparing")}
    </div>
  );
}
