import { useQuery } from "@tanstack/react-query";
import { DatabaseZap } from "lucide-react";
import type { CacheReuseAssessment, CacheReuseStatus } from "@paperclipai/shared";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { costsApi } from "../../api/costs";
import { useTranslation } from "../../i18n";
import { useUserPreferences } from "../../hooks/useUserPreferences";
import { queryKeys } from "../../lib/queryKeys";
import { formatPercent, formatTokenCount, formatUsdCents, showsMoney } from "../../lib/usage-display";

type CacheReuseIndicatorProps =
  | { scope: "agent"; companyId: string; agentId: string; className?: string }
  | { scope: "issue"; issueId: string; className?: string };

const STATUS_TONE: Record<CacheReuseStatus, string> = {
  high: "text-emerald-600 dark:text-emerald-400",
  moderate: "text-foreground",
  low: "text-amber-600 dark:text-amber-400",
  dropped: "text-amber-600 dark:text-amber-400",
  insufficient: "text-muted-foreground",
};

/**
 * Compact prompt-cache indicator: how much context was reused, written or
 * processed without the cache over the latest runs, with the causes Paperclip
 * can actually see. It never claims the cache "was lost" from one low run.
 */
export function CacheReuseIndicator(props: CacheReuseIndicatorProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { usageDisplay } = useUserPreferences();
  const id = props.scope === "agent" ? props.agentId : props.issueId;
  const { data } = useQuery({
    queryKey: queryKeys.cacheReuse(props.scope, id),
    queryFn: (): Promise<CacheReuseAssessment> =>
      props.scope === "agent" ? costsApi.agentCacheReuse(props.companyId, props.agentId) : costsApi.issueCacheReuse(props.issueId),
    staleTime: 60_000,
    retry: false,
  });
  if (!data || data.runs.length === 0) return null;

  const latest = data.runs.at(-1)!;
  const label = t(`cache.status.${data.status}`);
  const percent = data.latestRatio !== null && data.status !== "insufficient" ? formatPercent(data.latestRatio, locale) : null;
  const totals = data.runs.reduce(
    (acc, run) => ({
      reads: acc.reads + run.cacheReadTokens,
      writes: acc.writes + (run.cacheWriteTokens ?? 0),
      uncached: acc.uncached + run.uncachedInputTokens,
      writesKnown: acc.writesKnown && run.cacheWriteTokens !== null,
    }),
    { reads: 0, writes: 0, uncached: 0, writesKnown: true },
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors hover:bg-accent",
            STATUS_TONE[data.status],
            props.className,
          )}
          data-testid="cache-reuse-indicator"
          data-cache-status={data.status}
          aria-label={t("cache.indicatorLabel", { status: label })}
        >
          <DatabaseZap className="h-3.5 w-3.5" />
          <span>{label}</span>
          {percent ? <span className="tabular-nums text-muted-foreground">{percent}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3 text-xs">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{t("cache.title")}</p>
          <p className="text-muted-foreground">{t(`cache.statusHint.${data.status}`, {
            latest: data.latestRatio !== null ? formatPercent(data.latestRatio, locale) : "—",
            baseline: data.baselineRatio !== null ? formatPercent(data.baselineRatio, locale) : "—",
          })}</p>
          {data.insufficientReason ? <p className="text-muted-foreground">{t(`cache.insufficient.${data.insufficientReason}`)}</p> : null}
        </div>

        <dl className="grid grid-cols-3 gap-2" data-testid="cache-reuse-totals">
          <div><dt className="text-muted-foreground">{t("cache.reused")}</dt><dd className="font-medium tabular-nums">{formatTokenCount(totals.reads, locale)}</dd></div>
          <div><dt className="text-muted-foreground">{t("cache.written")}</dt><dd className="font-medium tabular-nums">{totals.writesKnown ? formatTokenCount(totals.writes, locale) : "—"}</dd></div>
          <div><dt className="text-muted-foreground">{t("cache.notReused")}</dt><dd className="font-medium tabular-nums">{formatTokenCount(totals.uncached, locale)}</dd></div>
        </dl>
        {showsMoney(usageDisplay) && data.savingsCents !== null ? (
          <p>{t("cache.savings", { amount: formatUsdCents(data.savingsCents, locale), runs: data.runs.length })}</p>
        ) : null}

        <ol className="space-y-1" aria-label={t("cache.recentRuns")}>
          {data.runs.slice(-8).map((run) => (
            <li key={run.runId} className="flex items-center gap-2">
              <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                {run.startedAt ? new Date(run.startedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "—"}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-emerald-500/70"
                  style={{ width: `${Math.round((run.reuseRatio ?? 0) * 100)}%` }}
                />
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums">{run.reuseRatio === null ? "—" : formatPercent(run.reuseRatio, locale)}</span>
            </li>
          ))}
        </ol>

        {data.status === "dropped" ? (
          <div className="space-y-1 rounded-md bg-muted/60 p-2" data-testid="cache-reuse-causes">
            <p className="font-medium text-foreground">{t("cache.possibleCauses")}</p>
            {data.latestCauses.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-4">
                {data.latestCauses.map((cause) => (
                  <li key={cause}>{t(`cache.cause.${cause}`, {
                    minutes: latest.gapMs !== null ? Math.round(latest.gapMs / 60_000) : "—",
                  })}</li>
                ))}
              </ul>
            ) : (
              <p>{t("cache.cause.unknown")}</p>
            )}
          </div>
        ) : null}
        <p className="text-muted-foreground">{t("cache.tip")}</p>
      </PopoverContent>
    </Popover>
  );
}
