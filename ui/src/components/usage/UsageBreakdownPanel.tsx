import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import type { UsageBreakdownRow, UsageDisplayMode, UsageGroupBy } from "@paperclipai/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { costsApi } from "../../api/costs";
import { useTranslation } from "../../i18n";
import { useUserPreferences } from "../../hooks/useUserPreferences";
import { queryKeys } from "../../lib/queryKeys";
import { formatTokenCount, formatUsdCents, showsMoney, showsTokens } from "../../lib/usage-display";
import { UsageDisplayToggle } from "./UsageDisplayToggle";

const GROUPS: UsageGroupBy[] = ["model", "agent", "user"];

interface UsageBreakdownPanelProps {
  companyId: string;
  from?: string;
  to?: string;
}

function rowLabel(row: UsageBreakdownRow, t: (key: string, options?: Record<string, unknown>) => string) {
  switch (row.groupKind) {
    case "automatic":
      return t("usage.groups.automatic");
    case "unattributed":
      return t("usage.groups.unattributed");
    case "system":
      return t("usage.groups.system");
    case "person":
      return row.label ?? t("usage.groups.formerUser");
    case "agent":
      return row.label ?? t("usage.groups.deletedAgent");
    default:
      return row.label ?? "—";
  }
}

function ApiEquivalentCell({ row, locale }: { row: Pick<UsageBreakdownRow, "apiEquivalent">; locale: string }) {
  const { t } = useTranslation();
  const api = row.apiEquivalent;
  if (api.cents === null) {
    return <span className="italic text-muted-foreground">{t("usage.unpriced")}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span>≈ {formatUsdCents(api.cents, locale)}</span>
      {!api.complete || api.cacheWritesEstimated ? (
        <span
          className="text-xs text-muted-foreground"
          title={[
            !api.complete ? t("usage.incompleteHint", { models: api.unpricedModels.join(", ") }) : null,
            api.cacheWritesEstimated ? t("usage.cacheWritesEstimatedHint") : null,
          ].filter(Boolean).join(" ")}
        >
          {t("usage.incomplete")}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Usage by model, agent or person. Tokens, money the provider reported and the
 * API-equivalent estimate are shown in separate, labelled columns; the user's
 * Tokens / Costs / Both preference decides which ones lead.
 */
export function UsageBreakdownPanel({ companyId, from, to }: UsageBreakdownPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { usageDisplay } = useUserPreferences();
  const [groupBy, setGroupBy] = useState<UsageGroupBy>("model");
  const [provider, setProvider] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.usageBreakdown(companyId, groupBy, provider, from, to),
    queryFn: () => costsApi.usageBreakdown(companyId, groupBy, provider, from, to),
  });

  const mode: UsageDisplayMode = usageDisplay;
  const tokensOn = showsTokens(mode);
  const moneyOn = showsMoney(mode);

  return (
    <div className="space-y-4" data-testid="usage-breakdown">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label={t("usage.groupBy")} className="inline-flex overflow-hidden rounded-md border border-border">
            {GROUPS.map((group, i) => (
              <button
                key={group}
                type="button"
                role="radio"
                aria-checked={groupBy === group}
                className={cn(
                  "px-2.5 py-1 text-xs transition-colors",
                  i > 0 && "border-l border-border",
                  groupBy === group ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-accent",
                )}
                onClick={() => {
                  setGroupBy(group);
                  setExpanded(new Set());
                }}
              >
                {t(`usage.groupByOption.${group}`)}
              </button>
            ))}
          </div>
          <NativeSelect
            aria-label={t("usage.provider")}
            className="w-auto py-1 text-xs"
            value={provider ?? ""}
            onChange={(event) => setProvider(event.target.value || null)}
          >
            <option value="">{t("usage.allProviders")}</option>
            {(data?.providers ?? []).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </NativeSelect>
        </div>
        <UsageDisplayToggle />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">{t("usage.loadFailed")}</p>
      ) : isLoading || !data ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="usage-totals">
            {tokensOn ? (
              <Card className="gap-1 py-3">
                <CardHeader className="px-4"><CardTitle className="text-xs font-medium text-muted-foreground">{t("usage.totals.tokens")}</CardTitle></CardHeader>
                <CardContent className="px-4">
                  <p className="text-xl font-semibold tabular-nums">{formatTokenCount(data.totals.tokens.totalTokens, locale)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("usage.tokenSplit", {
                      input: formatTokenCount(data.totals.tokens.uncachedInputTokens + data.totals.tokens.cacheWriteTokens, locale),
                      cached: formatTokenCount(data.totals.tokens.cacheReadTokens, locale),
                      output: formatTokenCount(data.totals.tokens.outputTokens, locale),
                    })}
                  </p>
                </CardContent>
              </Card>
            ) : null}
            {moneyOn ? (
              <>
                <Card className="gap-1 py-3">
                  <CardHeader className="px-4"><CardTitle className="text-xs font-medium text-muted-foreground">{t("usage.totals.reportedSpend")}</CardTitle></CardHeader>
                  <CardContent className="px-4">
                    <p className="text-xl font-semibold tabular-nums">{formatUsdCents(data.totals.reportedSpendCents, locale)}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.totals.estimatedSpendCents > 0
                        ? t("usage.totals.estimatedSpend", { amount: formatUsdCents(data.totals.estimatedSpendCents, locale) })
                        : t("usage.totals.reportedSpendHint")}
                    </p>
                  </CardContent>
                </Card>
                <Card className="gap-1 py-3">
                  <CardHeader className="px-4"><CardTitle className="text-xs font-medium text-muted-foreground">{t("usage.totals.apiEquivalent")}</CardTitle></CardHeader>
                  <CardContent className="px-4">
                    <p className="text-xl font-semibold tabular-nums"><ApiEquivalentCell row={data.totals} locale={locale} /></p>
                    <p className="text-xs text-muted-foreground">{t("usage.totals.apiEquivalentHint")}</p>
                  </CardContent>
                </Card>
              </>
            ) : null}
            <Card className="gap-1 py-3">
              <CardHeader className="px-4"><CardTitle className="text-xs font-medium text-muted-foreground">{t("usage.totals.cacheSavings")}</CardTitle></CardHeader>
              <CardContent className="px-4">
                <p className="text-xl font-semibold tabular-nums">
                  {moneyOn
                    ? data.totals.apiEquivalent.cacheSavingsCents === null
                      ? <span className="text-base italic text-muted-foreground">{t("usage.unpriced")}</span>
                      : `≈ ${formatUsdCents(data.totals.apiEquivalent.cacheSavingsCents, locale)}`
                    : formatTokenCount(data.totals.tokens.cacheReadTokens, locale)}
                </p>
                <p className="text-xs text-muted-foreground">{moneyOn ? t("usage.totals.cacheSavingsHint") : t("usage.totals.cacheReadHint")}</p>
              </CardContent>
            </Card>
          </div>

          {data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("usage.empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm" data-testid="usage-table">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">{t(`usage.groupByOption.${groupBy}`)}</th>
                    {tokensOn ? (
                      <>
                        <th scope="col" className="px-3 py-2 text-right font-medium">{t("usage.columns.input")}</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">{t("usage.columns.cacheWrite")}</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">{t("usage.columns.cacheRead")}</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">{t("usage.columns.output")}</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">{t("usage.columns.total")}</th>
                      </>
                    ) : null}
                    {moneyOn ? (
                      <>
                        <th scope="col" className="px-3 py-2 text-right font-medium">{t("usage.columns.reportedSpend")}</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">{t("usage.columns.apiEquivalent")}</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const key = `${row.groupKind}:${row.groupId ?? ""}`;
                    const open = expanded.has(key);
                    const canExpand = groupBy !== "model" && row.models.length > 0;
                    return (
                      <Fragment key={key}>
                        <tr className="border-t border-border" data-usage-row={row.groupKind}>
                          <th scope="row" className="px-3 py-2 text-left font-normal">
                            <span className="inline-flex items-center gap-1">
                              {canExpand ? (
                                <button
                                  type="button"
                                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                                  aria-expanded={open}
                                  aria-label={t(open ? "usage.hideModels" : "usage.showModels")}
                                  onClick={() => setExpanded((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(key)) next.delete(key);
                                    else next.add(key);
                                    return next;
                                  })}
                                >
                                  {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                              ) : null}
                              <span className={cn(row.groupKind === "automatic" || row.groupKind === "unattributed" ? "italic text-muted-foreground" : "")}>
                                {rowLabel(row, t)}
                              </span>
                            </span>
                          </th>
                          {tokensOn ? (
                            <>
                              <td className="px-3 py-2 text-right tabular-nums">{formatTokenCount(row.tokens.uncachedInputTokens, locale)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {row.tokens.cacheWriteCoverage === "none"
                                  ? <span className="text-muted-foreground" title={t("usage.cacheWritesNotReported")}>—</span>
                                  : formatTokenCount(row.tokens.cacheWriteTokens, locale)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatTokenCount(row.tokens.cacheReadTokens, locale)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatTokenCount(row.tokens.outputTokens, locale)}</td>
                              <td className="px-3 py-2 text-right font-medium tabular-nums">{formatTokenCount(row.tokens.totalTokens, locale)}</td>
                            </>
                          ) : null}
                          {moneyOn ? (
                            <>
                              <td className="px-3 py-2 text-right tabular-nums">{formatUsdCents(row.reportedSpendCents, locale)}</td>
                              <td className="px-3 py-2 text-right tabular-nums"><ApiEquivalentCell row={row} locale={locale} /></td>
                            </>
                          ) : null}
                        </tr>
                        {open
                          ? row.models.map((slice) => (
                              <tr key={`${key}:${slice.provider}:${slice.model}`} className="bg-muted/20 text-xs text-muted-foreground">
                                <th scope="row" className="py-1.5 pl-9 pr-3 text-left font-normal">{slice.model}</th>
                                {tokensOn ? (
                                  <>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{formatTokenCount(slice.tokens.uncachedInputTokens, locale)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{slice.tokens.cacheWriteCoverage === "none" ? "—" : formatTokenCount(slice.tokens.cacheWriteTokens, locale)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{formatTokenCount(slice.tokens.cacheReadTokens, locale)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{formatTokenCount(slice.tokens.outputTokens, locale)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{formatTokenCount(slice.tokens.totalTokens, locale)}</td>
                                  </>
                                ) : null}
                                {moneyOn ? (
                                  <>
                                    <td className="px-3 py-1.5" />
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                      {slice.apiEquivalentCents === null ? t("usage.unpriced") : `≈ ${formatUsdCents(slice.apiEquivalentCents, locale)}`}
                                    </td>
                                  </>
                                ) : null}
                              </tr>
                            ))
                          : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-1 text-xs text-muted-foreground" data-testid="usage-notes">
            <p className="flex items-start gap-1.5"><Info className="mt-0.5 h-3 w-3 shrink-0" />{t("usage.notes.apiEquivalent")}</p>
            {groupBy === "user" ? <p className="pl-4">{t("usage.notes.attribution")}</p> : null}
            <p className="pl-4">{t("usage.notes.tokens")}</p>
            {moneyOn && data.rateCards.length > 0 ? (
              <p className="pl-4">
                {t("usage.notes.rates")}{" "}
                {data.rateCards.map((card, i) => (
                  <Fragment key={`${card.provider}:${card.model}`}>
                    {i > 0 ? ", " : null}
                    <a href={card.source} target="_blank" rel="noreferrer" className="underline hover:text-foreground" title={card.notes?.join(" ")}>
                      {card.model}
                    </a>{" "}
                    ({card.verifiedAt})
                  </Fragment>
                ))}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
