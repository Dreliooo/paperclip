import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Button } from "./ui/button";
import { buildDotSetupPrompt } from "../lib/dot-setup-prompt";
import { AgentSetupPrompt } from "./AgentSetupPrompt";
import { useTranslation } from "@/i18n";

interface Connection {
  enabled: boolean;
  resourceUrl: string | null;
  binding: { id: string; status: string; connected: boolean; subscriptionVerified: boolean; hasPendingChallenge: boolean;
    assignment?: { status: string; attentionRequired: boolean } | null } | null;
}

/** Pairing codes stay in component memory and expire; never save them in config. */
export function DotRunnerConnection({ companyId, agentId, bindingId, onBinding }: {
  companyId?: string; agentId?: string; bindingId?: string; onBinding: (id: string) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [pairing, setPairing] = useState<{ pairingCode: string; expiresAt: string } | null>(null);
  const path = `/companies/${companyId}/agents/${agentId}/dot-binding`;
  const key = ["dot-binding", companyId, agentId];
  const state = useQuery({ queryKey: key, enabled: !!companyId && !!agentId,
    queryFn: () => api.get<Connection>(path),
    refetchInterval: query => query.state.data?.binding?.status === "pairing" ||
      (query.state.data?.binding?.connected && !query.state.data.binding.subscriptionVerified) ||
      query.state.data?.binding?.hasPendingChallenge || query.state.data?.binding?.assignment ? 5000 : false });
  const pair = useMutation({ mutationFn: () => api.post<{ bindingId: string; pairingCode: string; expiresAt: string }>(path, {}),
    onSuccess: result => { setPairing(result); onBinding(result.bindingId); void client.invalidateQueries({ queryKey: key }); } });
  const test = useMutation({ mutationFn: () => api.post(path + "/event-test", {}),
    onSuccess: () => { void client.invalidateQueries({ queryKey: key }); } });
  const revoke = useMutation({ mutationFn: () => api.delete(path),
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<Connection>(key, previous => previous ? { ...previous, binding: null } : previous);
      setPairing(null); onBinding("");
      await client.invalidateQueries({ queryKey: key });
    } });
  useEffect(() => {
    if (!pairing) return;
    const timer = window.setTimeout(() => setPairing(null), Math.max(0, Date.parse(pairing.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pairing]);
  const existingBindingId = state.data?.binding?.id;
  useEffect(() => {
    if (existingBindingId && existingBindingId !== bindingId && !revoke.isPending) onBinding(existingBindingId);
  }, [existingBindingId, bindingId, onBinding, revoke.isPending]);
  if (!agentId) return <p className="text-sm text-muted-foreground">{t("ui3g0.dotRunner.saveFirst")}</p>;
  const error = state.error ?? pair.error ?? test.error ?? revoke.error;
  const b = state.data?.binding;
  const setupPrompt = pairing && state.data?.resourceUrl && companyId && agentId
    ? buildDotSetupPrompt({ companyId, agentId, resourceUrl: state.data.resourceUrl, ...pairing })
    : "";
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">{t("ui3g0.dotRunner.description")}</p>
    {state.data && !state.data.enabled && <p className="text-sm text-muted-foreground">{t("ui3g0.dotRunner.enableExperimental")}</p>}
    {state.data?.resourceUrl && <p className="text-sm break-all">{t("ui3g0.dotRunner.privateMcpUrl")} <code>{state.data.resourceUrl}</code></p>}
    {b && <p className="text-sm">{t("ui3g0.dotRunner.connectionStatus", { status: b.status, subscription: b.subscriptionVerified ? t("ui3g0.dotRunner.verified") : t("ui3g0.dotRunner.required") })}</p>}
    {b?.assignment && <p className="text-sm">{t("ui3g0.dotRunner.assignmentStatus", { status: b.assignment.status === "offered" ? t("ui3g0.dotRunner.waitingAccept") : t("ui3g0.dotRunner.acceptedByDot") })}</p>}
    {b?.assignment?.attentionRequired && <p className="text-sm text-destructive" role="alert">{t("ui3g0.dotRunner.attentionRequired")}</p>}
    {pairing && setupPrompt && b?.status === "pairing" && <div className="space-y-2">
      <AgentSetupPrompt
        prompt={setupPrompt}
        label={t("ui3g0.dotRunner.setupLabel")}
        agent={{ name: "Dot", src: "/brands/adapters/openai-dot.svg" }}
        title={t("ui3g0.dotRunner.setupTitle")}
        description={t("ui3g0.dotRunner.setupDescription")}
        side="bottom"
      />
      <p className="text-xs text-muted-foreground">{t("ui3g0.dotRunner.setupExpires", { time: new Date(pairing.expiresAt).toLocaleTimeString() })}</p>
    </div>}
    {!pairing && b?.status === "pairing" && <p className="text-sm text-muted-foreground">{t("ui3g0.dotRunner.revokeToRepair")}</p>}
    <div className="flex flex-wrap items-center gap-2">
      {!b && <Button type="button" variant="outline" disabled={!state.data?.enabled || !state.data?.resourceUrl || pair.isPending} onClick={() => pair.mutate()}>{t("ui3g0.dotRunner.pair")}</Button>}
      {b?.subscriptionVerified && <Button type="button" variant="outline" disabled={test.isPending || b.hasPendingChallenge} onClick={() => test.mutate()}>{t("ui3g0.dotRunner.testEvent")}</Button>}
      <Button type="button" variant="outline" onClick={() => { void state.refetch(); }}>{t("ui3g0.dotRunner.refresh")}</Button>
      {b && <Button type="button" variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate()}>{t("ui3g0.dotRunner.revoke")}</Button>}
    </div>
    {b?.hasPendingChallenge && <p className="text-sm text-muted-foreground">{t("ui3g0.dotRunner.waitingChallenge")}</p>}
    {error && <p className="text-sm text-destructive" role="alert">{error instanceof Error ? error.message : t("ui3g0.dotRunner.connectionFailed")}</p>}
  </div>;
}
