import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DotPairing } from "@paperclipai/shared";
import { grokBotApi } from "@/api/grokBot";
import { buildGrokAccessPrompt, buildGrokRoutinePrompt } from "@/lib/grok-bot-setup-prompt";
import { AgentSetupPrompt } from "./AgentSetupPrompt";
import { CopyText } from "./CopyText";
import { Button, buttonVariants } from "./ui/button";
import { Input } from "./ui/input";
import { queryKeys } from "@/lib/queryKeys";
import { useTranslation } from "@/i18n";

/** Configuration writes update the authoritative binding, never an unsaved agent form. */
export function GrokBotConnection({ companyId, agentId }: { companyId?: string; agentId?: string }) {
  const { t } = useTranslation();
  const pairingCodeId = useId();
  const cache = useQueryClient();
  const key = ["grok-binding", companyId, agentId];
  const state = useQuery({ queryKey: key, enabled: !!companyId && !!agentId,
    queryFn: ({ signal }) => grokBotApi.connection(companyId!, agentId!, signal), retry: false, refetchInterval: 5000 });
  const [pairing, setPairing] = useState<DotPairing | null>(null);
  const [replace, setReplace] = useState(false);
  const [botName, setBotName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookKey, setWebhookKey] = useState("");
  const [inspected, setInspected] = useState(false);
  const verifyRequest = useRef<string | null>(null);
  const binding = state.data?.binding, routine = binding?.routine, exchange = routine?.lastExchange;
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: key });
    if (companyId && agentId) await cache.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId) });
  };
  const pair = useMutation({ mutationFn: async () => { setPairing(await grokBotApi.pair(companyId!, agentId!, binding?.status === "pairing" ? binding.id : undefined)); }, onSuccess: refresh, gcTime: 0 });
  const configure = useMutation({ mutationFn: async () => {
    await grokBotApi.configure(companyId!, agentId!, { bindingId: binding!.id, expectedRevision: routine?.revision ?? 0, botName, webhookUrl, webhookKey });
    setWebhookUrl(""); setWebhookKey(""); setReplace(false); verifyRequest.current = null;
  }, onSuccess: refresh, gcTime: 0 });
  const verify = useMutation({ mutationFn: async () => {
    if (["rejected", "cancelled"].includes(exchange?.status ?? "")) verifyRequest.current = null;
    verifyRequest.current ??= crypto.randomUUID();
    await grokBotApi.verify(companyId!, agentId!, binding!.id, verifyRequest.current);
  }, onSuccess: refresh, gcTime: 0 });
  const retryDelivery = useMutation({ mutationFn: (correlationId: string) => grokBotApi.retry(companyId!, agentId!, correlationId), onSuccess: refresh });
  const disconnect = useMutation({ mutationFn: () => grokBotApi.disconnect(companyId!, agentId!), onSuccess: async () => { setPairing(null); await refresh(); } });
  const recover = useMutation({ mutationFn: () => grokBotApi.recover(companyId!, agentId!), onSuccess: async () => { setInspected(false); verifyRequest.current = null; await refresh(); } });
  const stop = useMutation({ mutationFn: (runId: string) => grokBotApi.stop(companyId!, agentId!, runId), onSuccess: refresh });
  useEffect(() => { if (routine?.botName) setBotName(routine.botName); }, [routine?.botName]);
  useEffect(() => {
    if (!pairing) return;
    const timer = window.setTimeout(() => setPairing(null), Math.max(0, Date.parse(pairing.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pairing]);
  if (!agentId) return <p className="text-sm text-muted-foreground">{t("ui3g0.grokBot.saveFirst")}</p>;
  const busy = pair.isPending || configure.isPending || verify.isPending || disconnect.isPending || recover.isPending || stop.isPending || retryDelivery.isPending;
  const error = state.error ?? pair.error ?? configure.error ?? verify.error ?? disconnect.error ?? recover.error ?? stop.error ?? retryDelivery.error;
  const recovering = state.data?.recoveryNeeded || routine?.recoveryNeeded;
  const pending = exchange && ["prepared", "sending", "accepted"].includes(exchange.status) && Date.parse(exchange.expiresAt) > Date.now();
  return <section aria-label={t("ui3g0.grokBot.connectionLabel")} className="space-y-4 text-sm">
    <p className="text-muted-foreground">{t("ui3g0.grokBot.description")}</p>
    {state.isPending && <p role="status">{t("ui3g0.grokBot.loading")}</p>}
    {error && <p role="alert" className="text-destructive">{error.message}</p>}
    {state.data && !state.data.enabled && <p className="text-muted-foreground">{t("ui3g0.grokBot.enableHint")}</p>}
    {binding?.connected ? <>
      <p>{t("ui3g0.grokBot.agentAccessConnected")} {routine?.verified && !recovering ? t("ui3g0.grokBot.routineVerified") : t("ui3g0.grokBot.requiresVerified")}</p>
      <dl className="space-y-2 text-muted-foreground"><div><dt>Bot</dt><dd>{routine?.botName ?? t("ui3g0.grokBot.notConfigured")}</dd></div><div><dt>{t("ui3g0.grokBot.lastVerifiedExchange")}</dt><dd>{routine?.verifiedAt ? new Date(routine.verifiedAt).toLocaleString() : t("ui3g0.grokBot.notYetVerified")}</dd></div><div><dt>{t("ui3g0.grokBot.lastAuthenticatedContact")}</dt><dd>{routine?.lastContactAt ? new Date(routine.lastContactAt).toLocaleString() : t("ui3g0.grokBot.notYetObserved")}</dd></div></dl>
      {exchange && <p>{t("ui3g0.grokBot.assignmentDelivered")} {["accepted", "acknowledged"].includes(exchange.status) ? t("ui3g0.grokBot.yes") : t("ui3g0.grokBot.unconfirmed")}. {t("ui3g0.grokBot.replyReceived")} {exchange.acknowledgedAt ? t("ui3g0.grokBot.yes") : t("ui3g0.grokBot.no")}.</p>}
      {exchange?.status === "rejected" && <div className="space-y-2"><p>{t("ui3g0.grokBot.routineRejected")}</p><Button variant="outline" disabled={busy || recovering} onClick={() => retryDelivery.mutate(exchange.id)}>{t("ui3g0.grokBot.retryRejected")}</Button></div>}
      {!routine?.configured || replace ? <div className="space-y-3">
        <label className="block space-y-2"><span>{t("ui3g0.grokBot.botNameInGrok")}</span><Input value={botName} onChange={e => setBotName(e.target.value)} maxLength={100} /></label>
        <AgentSetupPrompt prompt={buildGrokRoutinePrompt(binding.id, botName || "your Bot")} label={t("ui3g0.grokBot.copyRoutineInstructions")} title={t("ui3g0.grokBot.enableAssignments")} description={t("ui3g0.grokBot.routineFallbackHint")} />
        <label className="block space-y-2"><span>{t("ui3g0.grokBot.webhookUrl")}</span><Input type="password" autoComplete="off" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} /></label>
        <label className="block space-y-2"><span>{t("ui3g0.grokBot.webhookKey")}</span><Input type="password" autoComplete="off" value={webhookKey} onChange={e => setWebhookKey(e.target.value)} /></label>
        <Button disabled={busy || recovering || !botName.trim() || !webhookUrl || !webhookKey} onClick={() => configure.mutate()}>{t("ui3g0.grokBot.saveRoutine")}</Button>
      </div> : <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !!pending || recovering || !!binding.assignment} onClick={() => verify.mutate()}>{t("ui3g0.grokBot.verifyConnection")}</Button>
        <Button variant="outline" disabled={busy || recovering || !!binding.assignment} onClick={() => setReplace(true)}>{t("ui3g0.grokBot.replaceCredentials")}</Button>
      </div>}
    </> : <>
      <Button disabled={busy || !state.data?.enabled || !state.data.canConfigureConnection} onClick={() => pair.mutate()}>{t("ui3g0.grokBot.reconnect")}</Button>
      {pairing && state.data?.resourceUrl && <>
        <AgentSetupPrompt prompt={buildGrokAccessPrompt(state.data.resourceUrl, botName || "your Bot")} label={t("ui3g0.grokBot.copyConnectionInstructions")} title={t("ui3g0.grokBot.reconnectTitle")} description={t("ui3g0.grokBot.oauthHint")} />
        <div className="space-y-2">
          <label htmlFor={pairingCodeId}>{t("ui3g0.grokBot.pairingCode")}</label>
          <div className="flex items-center gap-2">
            <Input id={pairingCodeId} type="password" autoComplete="off" readOnly value={pairing.pairingCode} onFocus={e => e.target.select()} />
            <CopyText text={pairing.pairingCode} ariaLabel={t("ui3g0.grokBot.copyPairingCode")} className={buttonVariants({ variant: "outline", size: "sm" })}>{t("ui3g0.grokBot.copyCode")}</CopyText>
          </div>
          <p className="text-xs text-muted-foreground">{t("ui3g0.grokBot.copyCodeHint")}</p>
        </div>
      </>}
    </>}
    {binding?.assignment && <div className="space-y-2"><p>{binding.assignment.status === "offered" ? t("ui3g0.grokBot.awaitingAck") : t("ui3g0.grokBot.workingInSession")}</p><Button variant="outline" disabled={busy} onClick={() => stop.mutate(binding.assignment!.runId)}>{t("ui3g0.grokBot.stopWork")}</Button><p className="text-xs text-muted-foreground">{t("ui3g0.grokBot.stopHint")}</p></div>}
    {recovering && <div className="space-y-3 rounded-md border border-border p-3">
      <p className="font-medium">{t("ui3g0.grokBot.recoveryNeeded")}</p><p className="text-muted-foreground">{t("ui3g0.grokBot.recoveryHint")}</p>
      <label className="flex items-start gap-2"><input type="checkbox" checked={inspected} onChange={e => setInspected(e.target.checked)} /><span>{t("ui3g0.grokBot.inspectedCheckbox")}</span></label>
      <Button variant="outline" disabled={busy || !inspected || !!binding?.assignment} onClick={() => recover.mutate()}>{t("ui3g0.grokBot.clearRecovery")}</Button>
      <p className="text-xs text-muted-foreground">{t("ui3g0.grokBot.recoveryRecordsInspection")}</p>
    </div>}
    {binding?.connected && <Button variant="outline" disabled={busy} onClick={() => disconnect.mutate()}>{t("ui3g0.grokBot.disconnect")}</Button>}
  </section>;
}
