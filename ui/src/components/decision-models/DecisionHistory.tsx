import { useTranslation } from "@/i18n";
import { useQuery } from "@tanstack/react-query";
import type { DecisionHistoryEntry } from "@paperclipai/shared";
import { decisionModelsApi } from "@/api/decision-models";
import { Link } from "@/lib/router";
import { formatDateTime, formatTokens, formatDetailedCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useFastResponsesEnabled } from "@/hooks/useFastResponsesEnabled";

export function DecisionHistoryTable({ entries, fastResponse = false, connectionsEnabled = true }: { entries: (DecisionHistoryEntry & { publicationStatus?: string; connectionName?: string | null })[]; fastResponse?: boolean; connectionsEnabled?: boolean }) {
  const { t } = useTranslation();
  if (!entries.length) return <p className="text-sm text-muted-foreground">{fastResponse ? t("ui2g0.decisionHistory.noFast") : t("ui2g0.decisionHistory.noRequests")} <Link to={connectionsEnabled ? "/company/settings/connections" : fastResponse ? "/company/settings/instance/experimental" : "/company/settings"} className="underline underline-offset-4">{fastResponse ? connectionsEnabled ? t("ui2g0.decisionHistory.configureFast") : t("ui2g0.decisionHistory.enableFast") : t("ui2g0.decisionHistory.configureModel")}</Link>{t("ui2g0.decisionHistory.runTest")}</p>;
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{t("ui2g0.decisionHistory.recent")}</p>
    <div className="overflow-x-auto"><table className="w-full text-sm" aria-label={fastResponse ? t("ui2g0.decisionHistory.tableFast") : t("ui2g0.decisionHistory.tableDecisions")}>
      <thead><tr className="border-b border-border text-muted-foreground">{[t("ui2g0.decisionHistory.colWhen"), t("ui2g0.decisionHistory.colResponsible"), t("ui2g0.decisionHistory.colTask"), ...(fastResponse ? [t("ui2g0.decisionHistory.colConnection")] : []), t("ui2g0.decisionHistory.colModel"), t("ui2g0.decisionHistory.colStatus"), t("ui2g0.decisionHistory.colDuration"), t("ui2g0.decisionHistory.colTokens"), t("ui2g0.decisionHistory.colCost")].map(label => <th key={label} className="px-3 py-2 text-left font-medium">{label}</th>)}</tr></thead>
      <tbody>{entries.map(row => <tr key={row.id} className="border-b border-border last:border-0">
        <td className="px-3 py-3"><div className="whitespace-nowrap">{formatDateTime(row.startedAt)}</div><div className="text-xs text-muted-foreground">{row.feature === "settings.test" ? t("ui2g0.decisionHistory.setupTest") : row.feature}</div></td>
        <td className="px-3 py-3">{row.actorType === "system" ? t("ui2g0.decisionHistory.paperclipServices") : row.userName ?? (row.responsibleUserId === "local-board" ? t("ui2g0.decisionHistory.board") : t("ui2g0.decisionHistory.formerUser"))}</td>
        <td className="px-3 py-3">{row.issueId ? <Link className="underline underline-offset-4" to={`/issues/${row.issueIdentifier ?? row.issueId}`}>{row.issueIdentifier ?? t("ui2g0.decisionHistory.viewTask")}</Link> : "—"}</td>
        {fastResponse && <td className="px-3 py-3">{row.connectionName ?? (row.connectionId ? t("ui2g0.decisionHistory.removedConnection") : "—")}</td>}
        <td className="px-3 py-3 font-mono text-xs">{row.model}</td>
        <td className="px-3 py-3"><div>{row.status === "succeeded" ? t("ui2g0.decisionHistory.succeeded") : row.status === "running" ? t("ui2g0.decisionHistory.running") : row.status === "unknown" ? t("ui2g0.decisionHistory.unresolved") : row.status === "skipped" ? t("ui2g0.decisionHistory.skipped") : row.status === "pending" ? t("ui2g0.decisionHistory.pending") : t("ui2g0.decisionHistory.failed")}</div>{row.publicationStatus && <div className="text-xs text-muted-foreground">{row.publicationStatus}</div>}{row.errorCode && <div className="text-xs text-muted-foreground">{row.errorCode.replaceAll("_", " ")}</div>}</td>
        <td className="px-3 py-3 font-mono">{row.durationMs === null ? "—" : `${(row.durationMs / 1000).toFixed(1)}s`}</td>
        <td className="whitespace-nowrap px-3 py-3 font-mono">{row.inputTokens === null ? "—" : formatTokens(row.inputTokens)} / {row.outputTokens === null ? "—" : formatTokens(row.outputTokens)}</td>
        <td className="px-3 py-3 font-mono"><div>{row.costCents === null ? t("ui2g0.decisionHistory.unknown") : formatDetailedCents(row.costCents)}</div>{row.costStatus !== "unpriced" && row.costStatus && <span className="text-xs text-muted-foreground">{row.costStatus === "estimated" ? t("ui2g0.decisionHistory.estimated") : t("ui2g0.decisionHistory.reported")}</span>}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
export function DecisionHistory({ companyId, from, to }: { companyId: string; from?: string | null; to?: string | null }) {
  const { t } = useTranslation();
  const { enabled } = useFastResponsesEnabled();
  const query = useQuery({ queryKey: ["decision-history", companyId, from, to], queryFn: () => decisionModelsApi.history(companyId, from, to), refetchInterval: q => q.state.data?.some(row => row.status === "running") ? 5000 : false });
  if (query.isPending) return <p className="text-sm text-muted-foreground">{t("ui2g0.decisionHistory.loading")}</p>;
  if (query.error) return <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{t("ui2g0.decisionHistory.loadError")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("ui2g0.decisionHistory.tryAgain")}</Button></div>;
  return <DecisionHistoryTable entries={query.data ?? []} connectionsEnabled={enabled} />;
}
