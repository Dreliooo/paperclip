import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "../lib/router";
import type { CostDataQualityItem, CostDataQualityReason } from "@paperclipai/shared";
import { costsApi } from "../api/costs";
import { formatDateTime } from "../lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { AgentAvatar } from "./AgentAvatar";
import { useToastActions } from "../context/ToastContext";
import { useTranslation } from "@/i18n";

const explanations: Record<CostDataQualityReason, { label: string; description: string }> = {
  unknown_billing: {
    label: "ui2g1.costDataQualityNotice.reasons.unknown_billing.label",
    description: "ui2g1.costDataQualityNotice.reasons.unknown_billing.description",
  },
  missing_model: {
    label: "ui2g1.costDataQualityNotice.reasons.missing_model.label",
    description: "ui2g1.costDataQualityNotice.reasons.missing_model.description",
  },
  missing_price: {
    label: "ui2g1.costDataQualityNotice.reasons.missing_price.label",
    description: "ui2g1.costDataQualityNotice.reasons.missing_price.description",
  },
  waiting_for_receipt: {
    label: "ui2g1.costDataQualityNotice.reasons.waiting_for_receipt.label",
    description: "ui2g1.costDataQualityNotice.reasons.waiting_for_receipt.description",
  },
  receipt_unavailable: {
    label: "ui2g1.costDataQualityNotice.reasons.receipt_unavailable.label",
    description: "ui2g1.costDataQualityNotice.reasons.receipt_unavailable.description",
  },
  retryable: {
    label: "ui2g1.costDataQualityNotice.reasons.retryable.label",
    description: "ui2g1.costDataQualityNotice.reasons.retryable.description",
  },
};

export function CostDataQualityNotice({ companyId, from, to, reportKey, unpricedCount, pendingCount, unknownBillingCount }: {
  companyId: string; from?: string; to?: string; reportKey: readonly unknown[];
  unpricedCount: number; pendingCount: number; unknownBillingCount: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const unavailableCount = unpricedCount + pendingCount;
  const hasCostGaps = unavailableCount > 0 || unknownBillingCount > 0;
  const detailsId = useId();
  const client = useQueryClient();
  const { pushToast } = useToastActions();
  const key = [...reportKey, "data-quality"];
  const { data, error, isPending, refetch } = useQuery({
    queryKey: key,
    queryFn: () => costsApi.dataQuality(companyId, from, to),
    enabled: open && hasCostGaps,
    refetchInterval: open && hasCostGaps ? 30_000 : false,
  });
  const retry = useMutation({
    mutationFn: (runId: string) => costsApi.retryAccounting(companyId, runId),
    onSuccess: result => {
      pushToast({
        title: result.accounted ? t("ui2g1.costDataQualityNotice.recorded") : t("ui2g1.costDataQualityNotice.noNewData"),
        body: t("ui2g1.costDataQualityNotice.notRerun"),
        tone: result.accounted ? "success" : "info",
      });
      client.invalidateQueries({ queryKey: ["costs", companyId] });
      client.invalidateQueries({ queryKey: key });
      client.invalidateQueries({ queryKey: ["cost-subscriptions", companyId] });
    },
  });
  const label = unavailableCount > 0
    ? t("ui2g1.costDataQualityNotice.unavailableRuns", { count: unavailableCount })
    : t("ui2g1.costDataQualityNotice.unknownBilling", { count: unknownBillingCount });

  const groups = new Map<string | null, {
    agent: { id?: string; name: string; appearance?: CostDataQualityItem["agentAppearance"] };
    items: { item: CostDataQualityItem; source: "event" | "run" }[];
  }>();
  for (const [source, items] of [["event", data?.events ?? []], ["run", data?.runs ?? []]] as const) {
    for (const item of items) {
      let group = groups.get(item.agentId);
      if (!group) {
        group = { agent: { id: item.agentId ?? undefined, name: item.agentName ?? (item.agentId ? t("ui2g1.costDataQualityNotice.unknownAgent") : t("ui2g1.costDataQualityNotice.paperclipServices")), appearance: item.agentAppearance }, items: [] };
        groups.set(item.agentId, group);
      }
      group.items.push({ item, source });
    }
  }
  const sortedGroups = [...groups.values()].sort((a, b) =>
    a.agent.name.localeCompare(b.agent.name, "en", { sensitivity: "base", numeric: true })
    || (a.agent.id ?? "").localeCompare(b.agent.id ?? ""));
  for (const group of sortedGroups) group.items.sort((a, b) =>
    Date.parse(b.item.occurredAt) - Date.parse(a.item.occurredAt)
    || `${a.source}:${a.item.id}`.localeCompare(`${b.source}:${b.item.id}`));

  function itemRow(item: CostDataQualityItem, source: "event" | "run") {
    const explanation = explanations[item.reason];
    return <li key={`${source}:${item.id}`} className="space-y-2 border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-normal text-muted-foreground">{t(explanation.label)}</Badge>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt)}</time>
          {item.runId && item.agentId && <Link className="text-primary underline underline-offset-4 hover:text-primary/80" to={`/agents/${item.agentId}/runs/${item.runId}`}>{t("ui2g1.costDataQualityNotice.viewRun")}</Link>}
          {item.reason === "retryable" && item.runId && data?.canRetry && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs font-normal underline hover:text-primary/80" disabled={retry.isPending}
            onClick={() => { retry.reset(); retry.mutate(item.runId!); }}>{t("ui2g1.costDataQualityNotice.retryRecording")}</Button>}
        </div>
      </div>
      <p>{t(explanation.description)}</p>
      {retry.variables === item.runId && retry.isPending && <p role="status">{t("ui2g1.costDataQualityNotice.recording")}</p>}
      {retry.variables === item.runId && retry.error && <p role="status">{t("ui2g1.costDataQualityNotice.recordingFailed")}</p>}
    </li>;
  }

  return <div className="space-y-2 text-sm text-muted-foreground">
    <Button type="button" variant="ghost" size="sm" className="h-auto justify-start gap-1 px-0 py-1 font-normal has-[>svg]:px-0" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(value => !value)}>
      {open ? <ChevronDown className="size-3" aria-hidden="true" /> : <ChevronRight className="size-3" aria-hidden="true" />}
      {label}
    </Button>
    {open && <div id={detailsId} className="space-y-2">
      {hasCostGaps && isPending && <p role="status">{t("ui2g1.costDataQualityNotice.loadingRuns")}</p>}
      {hasCostGaps && error && !data && <div className="flex flex-wrap items-center gap-2"><p role="status">{t("ui2g1.costDataQualityNotice.detailsLoadError")}</p><Button variant="outline" size="sm" onClick={() => refetch()}>{t("ui2g1.costDataQualityNotice.retryLoading")}</Button></div>}
      {hasCostGaps && data && <>
        {error && <p role="status">{t("ui2g1.costDataQualityNotice.staleDetails")}</p>}
        {data.events.length === 0 && data.runs.length === 0 && <p role="status">{t("ui2g1.costDataQualityNotice.noGaps")}</p>}
        <ul aria-label={t("ui2g1.costDataQualityNotice.detailsByAgent")} className="space-y-4">
          {sortedGroups.map(group => <li key={group.agent.id ?? "services"}>
            <h3 className="flex items-center gap-2 font-medium text-foreground">
              <AgentAvatar agent={group.agent} size={20} />
              {group.agent.id ? <Link className="text-primary underline underline-offset-4 hover:text-primary/80" to={`/agents/${group.agent.id}/configuration`}>{group.agent.name}</Link> : group.agent.name}
            </h3>
            <ul aria-label={t("ui2g1.costDataQualityNotice.groupLabel", { name: group.agent.name })}>{group.items.map(({ item, source }) => itemRow(item, source))}</ul>
          </li>)}
        </ul>
        {(data.hasMoreEvents || data.hasMoreRuns) && <p className="text-xs">{t("ui2g1.costDataQualityNotice.truncated")}</p>}
      </>}
    </div>}
  </div>;
}
