import type { CostByAgent } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Badge } from "./ui/badge";

/** Use this group's ledger counts, never the page-wide estimate count. */
export function CostEstimateLabel({
  eventCount,
  estimatedEventCount,
}: Partial<Pick<CostByAgent, "eventCount" | "estimatedEventCount">>) {
  const { t } = useTranslation();
  if (!estimatedEventCount) return null;
  const allEstimated = estimatedEventCount === eventCount;
  return (
    <Badge
      variant="outline"
      className="font-normal text-muted-foreground"
      title={t("costs.estimate.chargeTitle", { count: estimatedEventCount })}
    >
      {allEstimated ? t("costs.estimate.estimated") : t("costs.estimate.partiallyEstimated")}
    </Badge>
  );
}
