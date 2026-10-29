import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent } from "@paperclipai/shared";
import { toolsApi } from "@/api/tools";
import { queryKeys } from "@/lib/queryKeys";
import { AgentMultiSelect } from "@/components/AgentMultiSelect";
import { RadioCardGroup } from "@/components/ui/radio-card";
import { useTranslation } from "@/i18n";

export function EmailConnectionAccess({
  companyId,
  connectionId,
  agents,
}: {
  companyId: string;
  connectionId: string;
  agents: Agent[];
}) {
  const cache = useQueryClient();
  const { t } = useTranslation();
  const grants = useQuery({
    queryKey: queryKeys.tools.connectionGrants(connectionId),
    queryFn: () => toolsApi.listConnectionGrants(connectionId),
  });
  const installs = useQuery({
    queryKey: queryKeys.tools.connectionInstalls(connectionId),
    queryFn: () => toolsApi.getConnectionInstalls(connectionId),
  });
  const save = useMutation({
    mutationFn: (
      next: Array<{ targetType: "company" | "agent"; targetId: string }>,
    ) => toolsApi.putConnectionInstalls(connectionId, next),
    onSuccess: () => {
      void cache.invalidateQueries({
        queryKey: queryKeys.tools.connectionInstalls(connectionId),
      });
    },
  });
  if (grants.isLoading || installs.isLoading)
    return <p className="text-sm text-muted-foreground">{t("ui2g1.emailConnectionAccess.loading")}</p>;
  if (grants.error || installs.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("ui2g1.emailConnectionAccess.loadError")}
      </p>
    );
  const active = grants.data?.grants.filter((g) => g.status === "active") ?? [];
  const everyone = active.some((g) => g.kind === "organization");
  const personal = active.find((g) => g.kind === "user");
  const humanLabel = everyone
    ? t("ui2g1.emailConnectionAccess.anyHuman")
    : personal
      ? personal.subjectUserId === grants.data?.currentUserId
        ? t("ui2g1.emailConnectionAccess.justMe")
        : t("ui2g1.emailConnectionAccess.credentialOwner")
      : t("ui2g1.emailConnectionAccess.accessRevoked");
  const allAgents =
    installs.data?.installs.some((i) => i.targetType === "company") ?? false;
  const selected = new Set(
    installs.data?.installs
      .filter((i) => i.targetType === "agent")
      .map((i) => i.targetId),
  );
  const disabled = !grants.data?.capabilities.canConfigure || save.isPending;
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          {t("ui2g1.emailConnectionAccess.humansHeading")}
        </h2>
        <p className="text-sm">{humanLabel}</p>
      </section>
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">
          {t("ui2g1.emailConnectionAccess.agentsHeading")}
        </h2>
        <RadioCardGroup
          ariaLabel={t("ui2g1.emailConnectionAccess.agentsHeading")}
          value={allAgents ? "all" : "selected"}
          disabled={disabled}
          className="sm:grid-cols-2"
          options={[
            { value: "selected", title: t("ui2g1.emailConnectionAccess.pickAgents") },
            { value: "all", title: t("ui2g1.emailConnectionAccess.anyAgent") },
          ]}
          onValueChange={(value) =>
            save.mutate(
              value === "all"
                ? [{ targetType: "company", targetId: companyId }]
                : Array.from(selected, (targetId) => ({
                    targetType: "agent",
                    targetId,
                  })),
            )
          }
        />
        {!allAgents && (
          <AgentMultiSelect
            agents={agents.filter((a) => a.status !== "terminated")}
            selectedAgentIds={selected}
            disabled={disabled}
            onSave={(ids) =>
              save.mutate(
                Array.from(ids, (targetId) => ({
                  targetType: "agent",
                  targetId,
                })),
              )
            }
          />
        )}
        <p className="text-xs text-muted-foreground">
          {t("ui2g1.emailConnectionAccess.removeAgentHelp")}
        </p>
        {save.error && (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message}
          </p>
        )}
      </section>
    </div>
  );
}
