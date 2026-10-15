import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins, DollarSign } from "lucide-react";
import { costsApi } from "../../api/costs";
import { useTranslation } from "../../i18n";
import { useUserPreferences } from "../../hooks/useUserPreferences";
import { queryKeys } from "../../lib/queryKeys";
import { formatTokenCount, formatUsdCents } from "../../lib/usage-display";
import { MetricCard } from "../MetricCard";

interface DashboardUsageCardProps {
  companyId: string;
  monthSpendCents: number;
  monthBudgetCents: number;
  monthUtilizationPercent: number;
}

function monthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Month usage tile. Follows the user's Tokens / Costs / Both preference with
 * the same labels as Costs → Usage: reported spend is money charged; the API
 * equivalent is an estimate; tokens are shown regardless of how they were paid.
 */
export function DashboardUsageCard({ companyId, monthSpendCents, monthBudgetCents, monthUtilizationPercent }: DashboardUsageCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { usageDisplay } = useUserPreferences();
  const from = useMemo(() => monthStartIso(), []);
  const { data } = useQuery({
    queryKey: queryKeys.usageBreakdown(companyId, "model", null, from, undefined),
    queryFn: () => costsApi.usageBreakdown(companyId, "model", null, from),
    enabled: usageDisplay !== "costs",
  });
  const budgetLine = monthBudgetCents > 0
    ? t("usage.dashboard.budget", { percent: monthUtilizationPercent, budget: formatUsdCents(monthBudgetCents, locale) })
    : t("usage.dashboard.unlimited");

  if (usageDisplay === "tokens") {
    const topModel = data?.totals.models[0];
    return (
      <MetricCard
        icon={Coins}
        value={data ? formatTokenCount(data.totals.tokens.totalTokens, locale) : "—"}
        label={t("usage.dashboard.tokensLabel")}
        to="/costs?tab=usage"
        description={<span>{topModel ? t("usage.dashboard.topModel", { model: topModel.model }) : t("usage.dashboard.noUsage")}</span>}
      />
    );
  }

  return (
    <MetricCard
      icon={DollarSign}
      value={formatUsdCents(monthSpendCents, locale)}
      label={t("usage.dashboard.spendLabel")}
      to={usageDisplay === "both" ? "/costs?tab=usage" : "/costs"}
      description={
        <span>
          {budgetLine}
          {usageDisplay === "both" && data ? (
            <>
              {" · "}
              {t("usage.dashboard.tokensShort", { tokens: formatTokenCount(data.totals.tokens.totalTokens, locale) })}
              {data.totals.apiEquivalent.cents !== null
                ? ` · ${t("usage.dashboard.apiEquivalentShort", { amount: formatUsdCents(data.totals.apiEquivalent.cents, locale) })}`
                : null}
            </>
          ) : null}
        </span>
      }
    />
  );
}
