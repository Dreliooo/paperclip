import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import type { Agent, AgentLifecycleState } from "@paperclipai/shared";
import { Loader2 } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { useTranslation } from "@/i18n";

// Lookup keys; translated at render time.
const phases = {
  preparing: ["ui2g1.agentLifecycleStatus.phase.preparing.title", "ui2g1.agentLifecycleStatus.phase.preparing.description"],
  verifying: ["ui2g1.agentLifecycleStatus.phase.verifying.title", "ui2g1.agentLifecycleStatus.phase.verifying.description"],
  pausing: ["ui2g1.agentLifecycleStatus.phase.pausing.title", "ui2g1.agentLifecycleStatus.phase.pausing.description"],
  resuming: ["ui2g1.agentLifecycleStatus.phase.resuming.title", "ui2g1.agentLifecycleStatus.phase.resuming.description"],
  terminating: ["ui2g1.agentLifecycleStatus.phase.terminating.title", "ui2g1.agentLifecycleStatus.phase.terminating.description"],
  cleaning_up: ["ui2g1.agentLifecycleStatus.phase.cleaning_up.title", "ui2g1.agentLifecycleStatus.phase.cleaning_up.description"],
} satisfies Partial<Record<AgentLifecycleState, [string, string]>>;

const failedPhases = {
  preparing: "ui2g1.agentLifecycleStatus.failed.preparing", verifying: "ui2g1.agentLifecycleStatus.failed.verifying",
  pausing: "ui2g1.agentLifecycleStatus.failed.pausing", resuming: "ui2g1.agentLifecycleStatus.failed.resuming",
  terminating: "ui2g1.agentLifecycleStatus.failed.terminating", cleaning_up: "ui2g1.agentLifecycleStatus.failed.cleaning_up",
};

function pendingPhase(state?: AgentLifecycleState) {
  return state && state in phases ? phases[state as keyof typeof phases] : undefined;
}

export function agentLifecycleRefetchInterval(state?: AgentLifecycleState) {
  return pendingPhase(state) ? 2_000 : 30_000;
}

/** Poll lifecycle fields without refreshing the record used by editable forms. */
export function useAgentLifecycleStatus(agent?: Agent) {
  return useQuery({
    queryKey: [...queryKeys.agents.detail(agent?.id ?? ""), "lifecycle", agent?.companyId],
    queryFn: () => agentsApi.get(agent!.id, agent!.companyId),
    enabled: Boolean(agent),
    select: current => ({ status: current.status, lifecycleState: current.lifecycleState,
      lifecycleVersion: current.lifecycleVersion, lifecycleError: current.lifecycleError }),
    refetchInterval: query => agentLifecycleRefetchInterval(query.state.data?.lifecycleState ?? agent?.lifecycleState),
  });
}

export function AgentLifecycleStatus({ agent, onRetry, retryPending, refreshError = false }: {
  agent: Pick<Agent, "lifecycleState" | "lifecycleError">;
  onRetry: () => void;
  retryPending: boolean;
  refreshError?: boolean;
}) {
  const { t } = useTranslation();
  const phase = pendingPhase(agent.lifecycleState);
  if (!phase && !refreshError) return null;
  return <div role="status" aria-live="polite" className="space-y-2 text-sm">
    {refreshError && <p className="text-destructive">{t("ui2g1.agentLifecycleStatus.refreshError")}</p>}
    {phase && <div className="flex flex-wrap items-center gap-2">
      <Badge variant={agent.lifecycleError ? "destructive" : "secondary"}>
        {!agent.lifecycleError && <Loader2 aria-hidden="true" className="mr-1 size-3 animate-spin motion-reduce:animate-none" />}
        {agent.lifecycleError ? t(failedPhases[agent.lifecycleState as keyof typeof failedPhases]) : t(phase[0])}
      </Badge>
      {!agent.lifecycleError && <span className="text-muted-foreground">{t(phase[1])}</span>}
    </div>}
    {phase && agent.lifecycleError && <div className="flex flex-wrap items-center gap-2 text-destructive">
      <span>{agent.lifecycleError}</span>
      <Button variant="outline" size="sm" disabled={retryPending} onClick={onRetry}>
        {retryPending ? t("ui2g1.agentLifecycleStatus.retrying") : t("ui2g1.agentLifecycleStatus.retryNow")}
      </Button>
    </div>}
    {phase && agent.lifecycleError && <p className="text-muted-foreground">{t("ui2g1.agentLifecycleStatus.autoRetry")}</p>}
  </div>;
}
