import { useQuery } from "@tanstack/react-query";
import { grokBotApi } from "@/api/grokBot";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
/** Reports observed Paperclip activity; this is not a provider availability indicator. */
export function GrokBotWorkSummary({ companyId, agentId }: { companyId: string; agentId: string }) {
  const { t } = useTranslation();
  const state = useQuery({ queryKey: ["grok-binding", companyId, agentId], queryFn: ({ signal }) => grokBotApi.connection(companyId, agentId, signal), retry: false, refetchInterval: 10000 });
  const data = state.data, binding = data?.binding, routine = binding?.routine;
  return <div className="space-y-2 text-sm">
    {state.error && <p role="alert" className="text-destructive">{t("ui3g0.grokBot.statusRefreshFailed", { message: state.error.message })}</p>}
    <p>{data?.recoveryNeeded ? t("ui3g0.grokBot.recoveryNeeded") : binding?.assignment?.status === "offered" ? t("ui3g0.grokBot.awaitingAck") : binding?.assignment ? t("ui3g0.grokBot.workingInGrokBot") : routine?.verified ? t("ui3g0.grokBot.noActiveSession") : t("ui3g0.grokBot.setupIncomplete")}</p>
    {data?.currentTask && <Link className="underline" to={`/issues/${data.currentTask.id}`}>{data.currentTask.identifier}: {data.currentTask.title}</Link>}
    <p className="text-muted-foreground">{t("ui3g0.grokBot.queuedTasks", { value: data?.queuedTaskCount ?? t("ui3g0.grokBot.checking") })}</p>
    <p className="text-muted-foreground">{t("ui3g0.grokBot.lastContact", { value: routine?.lastContactAt ? new Date(routine.lastContactAt).toLocaleString() : t("ui3g0.grokBot.notObserved") })}</p>
    <p className="text-xs text-muted-foreground">{t("ui3g0.grokBot.activityNote")}</p>
  </div>;
}
