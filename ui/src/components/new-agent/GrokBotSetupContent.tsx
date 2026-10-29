import { useId } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { AGENT_ROLES, type CreateGrokInvitation, type DotPairing, type GrokConnection } from "@paperclipai/shared";
import { AdapterMark } from "../AdapterMark";
import { AgentSetupPrompt } from "../AgentSetupPrompt";
import { Button, buttonVariants } from "../ui/button";
import { CopyText } from "../CopyText";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/select";
import { DialogDescription, DialogTitle } from "../ui/dialog";
import { buildGrokAccessPrompt, buildGrokRoutinePrompt } from "@/lib/grok-bot-setup-prompt";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";

export type GrokSetupStep = 0 | 1 | 2 | 3;
export interface GrokBotSetupContentProps {
  step: GrokSetupStep; companyName: string; details: CreateGrokInvitation;
  created: boolean; loading?: boolean; busy?: boolean; error?: string;
  managers: Array<{ id: string; name: string }>;
  connection?: GrokConnection; pairing: DotPairing | null; approvalHref?: string;
  webhookUrl: string; webhookKey: string; editingCredentials?: boolean;
  onEditCredentials?: () => void;
  onDetails: (details: CreateGrokInvitation) => void;
  onCredentials: (url: string, key: string) => void;
  onBack: () => void; onExit: () => void; onNext: () => void; onRetry: () => void;
}
const steps = ["ui3g2.grokBotSetup.steps.identify", "ui3g2.grokBotSetup.steps.connect", "ui3g2.grokBotSetup.steps.enable", "ui3g2.grokBotSetup.steps.verify"];
export function GrokBotSetupContent(p: GrokBotSetupContentProps) {
  const { t } = useTranslation();
  const pairingCodeId = useId();
  const binding = p.connection?.binding;
  const routine = binding?.routine;
  const exchange = routine?.lastExchange;
  const delivered = exchange?.status === "accepted" || exchange?.status === "acknowledged";
  const replied = !!routine?.verified && exchange?.status === "acknowledged";
  const ready = replied && p.connection?.agentLifecycleState === "ready" && !!p.connection.canConfigureConnection && !routine?.recoveryNeeded;
  const pending = exchange && ["prepared", "sending", "accepted"].includes(exchange.status) && Date.parse(exchange.expiresAt) > Date.now();
  const nextDisabled = p.busy || p.loading || !!p.approvalHref
    || p.step === 0 && (!p.details.name.trim() || !p.details.botName.trim())
    || p.step === 1 && !binding?.connected
    || p.step === 2 && ((!routine?.configured || p.editingCredentials) && (!p.webhookUrl || !p.webhookKey))
    || p.step === 3 && !ready && (!!pending || !!routine?.recoveryNeeded || !!replied);
  return <>
    <div className="min-h-0 space-y-6 overflow-y-auto px-6 pb-6 pt-8 sm:px-8">
      <div className="space-y-3 pr-5">
        <AdapterMark type="grok_bot" className="size-10" />
        <DialogTitle className="text-xl font-semibold tracking-tight">{ready ? t("ui3g2.grokBotSetup.connectedTitle") : t("ui3g2.grokBotSetup.connectTitle")}</DialogTitle>
        <DialogDescription className="text-sm leading-relaxed">{ready ? t("ui3g2.grokBotSetup.readyDescription", { botName: p.details.botName, companyName: p.companyName }) : t("ui3g2.grokBotSetup.description", { companyName: p.companyName })}</DialogDescription>
      </div>
      <ol aria-label={t("ui3g2.grokBotSetup.stepsLabel")} className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
        {steps.map((label, index) => <li key={label} aria-current={p.step === index ? "step" : undefined} className={p.step === index ? "font-medium text-foreground" : ""}>{index + 1}. {t(label)}</li>)}
      </ol>
      {p.error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{p.error}</p><Button variant="outline" disabled={p.busy} onClick={p.onRetry}>{t("ui3g2.grokBotSetup.tryAgain")}</Button></div>}
      {p.loading ? <p role="status" className="text-sm text-muted-foreground">{t("ui3g2.grokBotSetup.restoring")}</p> : p.approvalHref ? <p className="text-sm text-muted-foreground">{t("ui3g2.grokBotSetup.approvalNeeded")}</p> : <>
        {p.step === 0 && <div className="space-y-4">
          <label className="block space-y-2 text-sm"><span>{t("ui3g2.grokBotSetup.paperclipName")}</span><Input value={p.details.name} disabled={p.created} onChange={e => p.onDetails({ ...p.details, name: e.target.value })} autoComplete="off" maxLength={100} /></label>
          <label className="block space-y-2 text-sm"><span>{t("ui3g2.grokBotSetup.botNameInGrok")}</span><Input value={p.details.botName} disabled={p.created} onChange={e => p.onDetails({ ...p.details, botName: e.target.value })} autoComplete="off" maxLength={100} /></label>
          <p className="text-xs text-muted-foreground">{t("ui3g2.grokBotSetup.botNameHelp")}</p>
          <label className="block space-y-2 text-sm"><span>{t("ui3g2.grokBotSetup.role")}</span><NativeSelect disabled={p.created} value={p.details.role ?? "general"} onChange={e => p.onDetails({ ...p.details, role: e.target.value as CreateGrokInvitation["role"] })}>{AGENT_ROLES.map(role => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</NativeSelect></label>
          <label className="block space-y-2 text-sm"><span>{t("ui3g2.grokBotSetup.manager")}</span><NativeSelect disabled={p.created} value={p.details.reportsTo ?? ""} onChange={e => p.onDetails({ ...p.details, reportsTo: e.target.value || null })}><option value="">{t("ui3g2.grokBotSetup.noManager")}</option>{p.managers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</NativeSelect></label>
        </div>}
        {p.step === 1 && <div className="space-y-4 text-sm">
          <p>{t("ui3g2.grokBotSetup.connectIntro")}</p>
          {p.connection?.resourceUrl && <AgentSetupPrompt prompt={buildGrokAccessPrompt(p.connection.resourceUrl, p.details.botName)} label={t("ui3g2.grokBotSetup.copyConnectionLabel")} title={t("ui3g2.grokBotSetup.connectAccessTitle")} description={t("ui3g2.grokBotSetup.connectAccessDescription")} />}
          {!binding?.connected && p.pairing && <div className="space-y-2">
            <label htmlFor={pairingCodeId}>{t("ui3g2.grokBotSetup.pairingCodeLabel")}</label>
            <div className="flex items-center gap-2">
              <Input id={pairingCodeId} value={p.pairing.pairingCode} readOnly type="password" autoComplete="off" />
              <CopyText text={p.pairing.pairingCode} ariaLabel={t("ui3g2.grokBotSetup.copyPairingCodeAria")} className={buttonVariants({ variant: "outline", size: "sm" })}>{t("ui3g2.grokBotSetup.copyCode")}</CopyText>
            </div>
            <p className="text-xs text-muted-foreground">{t("ui3g2.grokBotSetup.pairingHelp", { time: new Date(p.pairing.expiresAt).toLocaleTimeString() })}</p>
          </div>}
          <p role="status" aria-live="polite" className="text-muted-foreground">{binding?.connected ? t("ui3g2.grokBotSetup.accessConnected") : t("ui3g2.grokBotSetup.watchingAuthorization")}</p>
          <p className="text-xs text-muted-foreground">{t("ui3g2.grokBotSetup.accountWideNote")}</p>
        </div>}
        {p.step === 2 && <div className="space-y-4 text-sm">
          <p>{t("ui3g2.grokBotSetup.routineIntro")}</p>
          {binding && <AgentSetupPrompt prompt={buildGrokRoutinePrompt(binding.id, p.details.botName)} label={t("ui3g2.grokBotSetup.copyRoutineLabel")} title={t("ui3g2.grokBotSetup.enableAssignmentsTitle")} description={t("ui3g2.grokBotSetup.enableAssignmentsDescription")} />}
          <p className="text-xs text-muted-foreground">{t("ui3g2.grokBotSetup.webhookLinkHelp")}</p>
          {routine?.configured && !p.editingCredentials && !p.webhookUrl && !p.webhookKey ? <div className="space-y-2"><p role="status" className="text-muted-foreground">{t("ui3g2.grokBotSetup.credentialsStored")}</p>{p.onEditCredentials && <Button variant="outline" onClick={p.onEditCredentials} disabled={p.busy}>{t("ui3g2.grokBotSetup.replaceCredentials")}</Button>}</div> : <>
            <label className="block space-y-2"><span>{t("ui3g2.grokBotSetup.webhookUrl")}</span><Input value={p.webhookUrl} onChange={e => p.onCredentials(e.target.value, p.webhookKey)} type="password" autoComplete="off" spellCheck={false} /></label>
            <label className="block space-y-2"><span>{t("ui3g2.grokBotSetup.webhookKey")}</span><Input value={p.webhookKey} onChange={e => p.onCredentials(p.webhookUrl, e.target.value)} type="password" autoComplete="off" spellCheck={false} /></label>
          </>}
          <p className="text-xs text-muted-foreground">{t("ui3g2.grokBotSetup.credentialsHelp")}</p>
        </div>}
        {p.step === 3 && <section aria-label={t("ui3g2.grokBotSetup.checksLabel")} className="space-y-4 text-sm">
          {[{ labelKey: "ui3g2.grokBotSetup.checks.delivered", done: delivered }, { labelKey: "ui3g2.grokBotSetup.checks.reply", done: replied }].map(check => <p key={check.labelKey} className="flex items-center gap-3">{check.done ? <Check className="size-4" /> : pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <Circle className="size-4 text-muted-foreground" />}{t(check.labelKey)}<span className="text-muted-foreground">{check.done ? t("ui3g2.grokBotSetup.checks.complete") : t("ui3g2.grokBotSetup.checks.waiting")}</span></p>)}
          <p role="status" aria-live="polite" className="text-muted-foreground">{routine?.recoveryNeeded ? t("ui3g2.grokBotSetup.checks.recovery") : ready ? t("ui3g2.grokBotSetup.checks.ready") : replied ? t("ui3g2.grokBotSetup.checks.finishing") : exchange?.status === "rejected" ? t("ui3g2.grokBotSetup.checks.rejected") : delivered ? t("ui3g2.grokBotSetup.checks.accepted") : t("ui3g2.grokBotSetup.checks.challenge")}</p>
          <p className="text-xs text-muted-foreground">{t("ui3g2.grokBotSetup.externalNote")}</p>
        </section>}
      </>}
    </div>
    <div className="flex items-center justify-between gap-3 border-t px-6 py-4 sm:px-8">
      <div className="flex items-center gap-2"><Button variant="ghost" onClick={p.onBack} disabled={p.busy}>{t("ui3g2.grokBotSetup.back")}</Button><Button variant="ghost" onClick={p.onExit} disabled={p.busy}>{t("ui3g2.grokBotSetup.saveExit")}</Button></div>
      {p.approvalHref ? <Button asChild><Link to={p.approvalHref} onClick={p.onExit}>{t("ui3g2.grokBotSetup.reviewApproval")}</Link></Button> : <Button onClick={p.onNext} disabled={nextDisabled}>{p.busy ? t("ui3g2.grokBotSetup.saving") : ready ? t("ui3g2.grokBotSetup.done") : p.step === 3 ? pending ? t("ui3g2.grokBotSetup.waitingReply") : replied ? t("ui3g2.grokBotSetup.finishingSetup") : t("ui3g2.grokBotSetup.verifyConnection") : t("ui3g2.grokBotSetup.continue")}</Button>}
    </div>
  </>;
}
