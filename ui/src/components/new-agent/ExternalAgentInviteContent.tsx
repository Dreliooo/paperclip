import { Link } from "@/lib/router";
import { ArrowLeft, Check, Circle, CircleAlert, Loader2 } from "lucide-react";
import { AdapterMark } from "../AdapterMark";
import { AgentSetupPrompt } from "../AgentSetupPrompt";
import { Button } from "../ui/button";
import { DialogDescription, DialogTitle } from "../ui/dialog";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";

export type ExternalAgentPreset = "dot" | "grok_bot" | "hermes" | "other";
export type DotConnectionState = {
  phase: "waiting" | "connected" | "subscribed" | "testing" | "finishing" | "ready";
  problem?: "event_timeout" | "prompt_unavailable" | "offline" | "agent_unavailable";
};

const presets = [
  { id: "dot", nameKey: "ui3g1.ExternalAgentInviteContent.presetDotName", adapter: "openai_dot", descriptionKey: "ui3g1.ExternalAgentInviteContent.presetDotDescription" },
  { id: "grok_bot", nameKey: "ui3g1.ExternalAgentInviteContent.presetGrokName", adapter: "grok_bot", descriptionKey: "ui3g1.ExternalAgentInviteContent.presetGrokDescription" },
  { id: "hermes", nameKey: "ui3g1.ExternalAgentInviteContent.presetHermesName", adapter: "hermes_gateway", descriptionKey: "ui3g1.ExternalAgentInviteContent.presetHermesDescription" },
  { id: "other", nameKey: "ui3g1.ExternalAgentInviteContent.presetOtherName", adapter: "http", descriptionKey: "ui3g1.ExternalAgentInviteContent.presetOtherDescription" },
] as const;

export function ExternalAgentPresetPicker({ onSelect, dotDisabledReason, grokDisabledReason }: { onSelect: (preset: ExternalAgentPreset) => void; dotDisabledReason?: string; grokDisabledReason?: string }) {
  const { t } = useTranslation();
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {presets.map(preset => <button
      key={preset.id}
      type="button"
      onClick={() => onSelect(preset.id)}
      disabled={preset.id === "dot" && !!dotDisabledReason || preset.id === "grok_bot" && !!grokDisabledReason}
      title={preset.id === "dot" ? dotDisabledReason : preset.id === "grok_bot" ? grokDisabledReason : undefined}
      className="flex aspect-square flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-3 py-4 text-center transition-colors disabled:opacity-50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <AdapterMark type={preset.adapter} className="size-8" />
      <span className="text-sm font-medium">{t(preset.nameKey)}</span>
      <span className="sr-only">{t(preset.descriptionKey)}</span>
    </button>)}
  </div>;
}

const checks = [
  { titleKey: "ui3g1.ExternalAgentInviteContent.checkConnectedTitle", descriptionKey: "ui3g1.ExternalAgentInviteContent.checkConnectedDescription" },
  { titleKey: "ui3g1.ExternalAgentInviteContent.checkUpdatesTitle", descriptionKey: "ui3g1.ExternalAgentInviteContent.checkUpdatesDescription" },
  { titleKey: "ui3g1.ExternalAgentInviteContent.checkTestTitle", descriptionKey: "ui3g1.ExternalAgentInviteContent.checkTestDescription" },
];

/** Controlled by server evidence in the invite controller, never by copying a prompt. */
export function DotConnectionChecks({ state }: { state: DotConnectionState }) {
  const { t } = useTranslation();
  const completed = { waiting: 0, connected: 1, subscribed: 2, testing: 2, finishing: 3, ready: 3 }[state.phase];
  const message = state.problem === "agent_unavailable" ? t("ui3g1.ExternalAgentInviteContent.msgAgentUnavailable")
    : state.problem === "offline" ? t("ui3g1.ExternalAgentInviteContent.msgOffline")
    : state.problem === "prompt_unavailable" ? t("ui3g1.ExternalAgentInviteContent.msgPromptUnavailable")
    : state.problem === "event_timeout" ? t("ui3g1.ExternalAgentInviteContent.msgEventTimeout")
    : state.phase === "finishing" ? t("ui3g1.ExternalAgentInviteContent.msgFinishing")
    : state.phase === "ready" ? t("ui3g1.ExternalAgentInviteContent.msgReady")
    : state.phase === "waiting" ? t("ui3g1.ExternalAgentInviteContent.msgWaiting")
    : state.phase === "connected" ? t("ui3g1.ExternalAgentInviteContent.msgConnected")
    : t("ui3g1.ExternalAgentInviteContent.msgTestPending");
  return <section aria-label={t("ui3g1.ExternalAgentInviteContent.dotConnectionChecks")} className="space-y-4">
    <ol className="space-y-4">
      {checks.map((check, index) => {
        const done = index < completed;
        const failed = index === completed && state.problem === "event_timeout";
        const active = index === completed && !state.problem;
        const Icon = done ? Check : failed ? CircleAlert : active ? Loader2 : Circle;
        return <li key={check.titleKey} className="flex items-start gap-3" aria-current={active ? "step" : undefined}>
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", done ? "bg-accent text-foreground" : failed ? "text-destructive" : "text-muted-foreground")}>
            <Icon className={cn("size-4", active && "animate-spin motion-reduce:animate-none")} />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={cn("text-sm", done || active || failed ? "font-medium" : "text-muted-foreground")}>
              {t(check.titleKey)}<span className="sr-only">{done ? t("ui3g1.ExternalAgentInviteContent.statusComplete") : failed ? t("ui3g1.ExternalAgentInviteContent.statusNeedsAttention") : active ? t("ui3g1.ExternalAgentInviteContent.statusInProgress") : t("ui3g1.ExternalAgentInviteContent.statusWaiting")}</span>
            </p>
            {done && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(check.descriptionKey)}</p>}
          </div>
        </li>;
      })}
    </ol>
    <p role={state.problem && state.problem !== "prompt_unavailable" ? "alert" : "status"} aria-live="polite" className={cn("text-sm leading-relaxed", state.problem && state.problem !== "prompt_unavailable" ? "text-destructive" : "text-muted-foreground")}>{message}</p>
  </section>;
}

/** Shared presentation for the invitation flow. The caller owns invitations and watching. */
export function ExternalAgentInviteContent({
  preset, prompt, companyName, connection, onSelect, onBack, onClose, onCopied, onRetry, onNewPrompt,
  dotDisabledReason, grokDisabledReason, busy = false, error, approvalHref,
}: {
  dotDisabledReason?: string;
  grokDisabledReason?: string;
  busy?: boolean;
  error?: string;
  approvalHref?: string;
  preset: ExternalAgentPreset | null;
  prompt: string;
  companyName: string;
  connection: DotConnectionState;
  onSelect: (preset: ExternalAgentPreset) => void;
  onBack: () => void;
  onClose: () => void;
  onCopied: () => void;
  onRetry: () => void;
  onNewPrompt: () => void;
}) {
  const { t } = useTranslation();
  const provider = presets.find(item => item.id === preset);
  const dot = preset === "dot";
  const ready = dot && connection.phase === "ready" && !connection.problem;
  const connecting = dot && connection.phase !== "waiting";
  const progressLabel = connection.problem === "agent_unavailable" ? t("ui3g1.ExternalAgentInviteContent.progressAgentUnavailable")
    : connection.problem === "offline" ? t("ui3g1.ExternalAgentInviteContent.progressUpdatesPaused")
    : connection.problem === "event_timeout" ? t("ui3g1.ExternalAgentInviteContent.progressNeedsAttention")
    : connection.phase === "finishing" ? t("ui3g1.ExternalAgentInviteContent.progressFinishing")
    : connection.phase === "connected" ? t("ui3g1.ExternalAgentInviteContent.progressConnecting") : t("ui3g1.ExternalAgentInviteContent.progressConfirming");
  return <>
    <div className="min-h-0 space-y-6 overflow-y-auto px-6 pb-6 pt-8 sm:px-8">
      <div className="space-y-3 pr-5">
        {provider && <AdapterMark type={provider.adapter} className="size-10" />}
        <div className="space-y-2">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {!provider ? t("ui3g1.ExternalAgentInviteContent.dialogTitleInvite") : dot ? ready ? t("ui3g1.ExternalAgentInviteContent.dialogTitleYourDotConnected") : t("ui3g1.ExternalAgentInviteContent.dialogTitleConnectDot") : preset === "hermes" ? t("ui3g1.ExternalAgentInviteContent.dialogTitleHermes") : t("ui3g1.ExternalAgentInviteContent.dialogTitleAgent")}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {!provider ? t("ui3g1.ExternalAgentInviteContent.descBringAgent", { company: companyName })
              : ready ? t("ui3g1.ExternalAgentInviteContent.descReady", { company: companyName })
              : connection.problem === "agent_unavailable" ? t("ui3g1.ExternalAgentInviteContent.descAgentUnavailable")
              : connection.phase === "finishing" ? t("ui3g1.ExternalAgentInviteContent.descFinishing")
              : connecting ? t("ui3g1.ExternalAgentInviteContent.descConnecting")
              : dot ? t("ui3g1.ExternalAgentInviteContent.descDot")
              : preset === "hermes" ? t("ui3g1.ExternalAgentInviteContent.descHermes") : t("ui3g1.ExternalAgentInviteContent.descAgent")}
          </DialogDescription>
        </div>
      </div>
      {error && <div role="alert" className="space-y-3 text-sm text-destructive"><p>{error}</p><Button variant="outline" disabled={busy} onClick={onRetry}>{t("ui3g1.ExternalAgentInviteContent.tryAgain")}</Button></div>}
      {!provider ? <><ExternalAgentPresetPicker onSelect={onSelect} dotDisabledReason={dotDisabledReason} grokDisabledReason={grokDisabledReason} />
        {dotDisabledReason && <p className="text-sm text-muted-foreground">{dotDisabledReason}</p>}{grokDisabledReason && grokDisabledReason !== dotDisabledReason && <p className="text-sm text-muted-foreground">{grokDisabledReason}</p>}</>
        : approvalHref ? <p className="text-sm text-muted-foreground">{t("ui3g1.ExternalAgentInviteContent.approvalNeeded")}</p>
        : busy && !prompt && connection.phase === "waiting" ? <p role="status" className="text-sm text-muted-foreground">{t("ui3g1.ExternalAgentInviteContent.preparingInvitation")}</p> : dot ? <>
        <div className="border-t pt-6"><DotConnectionChecks state={connection} />
          {connection.phase === "waiting" && <p className="mt-4 text-xs text-muted-foreground">{t("ui3g1.ExternalAgentInviteContent.dotOpenAiNote")}</p>}</div>
        {connection.problem === "event_timeout" && <Button variant="outline" disabled={busy} onClick={onRetry}>{t("ui3g1.ExternalAgentInviteContent.retryTestEvent")}</Button>}
        {connection.problem === "offline" && <Button variant="outline" disabled={busy} onClick={onRetry}>{t("ui3g1.ExternalAgentInviteContent.reconnectUpdates")}</Button>}
      </> : <p className="text-sm leading-relaxed text-muted-foreground">{t("ui3g1.ExternalAgentInviteContent.includesEverything", { company: companyName })}</p>}
    </div>
    <div className="flex items-center justify-between gap-3 border-t px-6 py-4 sm:px-8">
      <Button variant="ghost" onClick={provider ? onBack : onClose}>
        {provider && <ArrowLeft className="size-4" />}{provider ? t("ui3g1.ExternalAgentInviteContent.back") : t("ui3g1.ExternalAgentInviteContent.cancel")}
      </Button>
      {provider && (approvalHref ? <Button asChild><Link to={approvalHref} onClick={onClose}>{t("ui3g1.ExternalAgentInviteContent.reviewApproval")}</Link></Button>
        : ready ? <Button onClick={onClose}>{t("ui3g1.ExternalAgentInviteContent.done")}</Button>
        : connecting ? <Button disabled aria-live="polite">
          {!connection.problem && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {progressLabel}
        </Button>
        : dot && connection.problem === "prompt_unavailable" ? <Button disabled={busy} onClick={onNewPrompt}>{t("ui3g1.ExternalAgentInviteContent.createNewPrompt")}</Button>
        : !prompt || busy ? <Button disabled>{busy ? t("ui3g1.ExternalAgentInviteContent.preparing") : t("ui3g1.ExternalAgentInviteContent.waitingForDot")}</Button>
        : <AgentSetupPrompt
          key={preset}
          prompt={prompt}
          label={dot ? t("ui3g1.ExternalAgentInviteContent.copySetupPrompt") : t("ui3g1.ExternalAgentInviteContent.copyInvitationPrompt")}
          title={dot ? t("ui3g1.ExternalAgentInviteContent.dialogTitleConnectDot") : t("ui3g1.ExternalAgentInviteContent.dialogTitleAgent")}
          description={dot ? t("ui3g1.ExternalAgentInviteContent.setupPromptDescription") : t("ui3g1.ExternalAgentInviteContent.invitationPromptDescription")}
          agent={dot ? { name: "Dot", src: "/brands/adapters/openai-dot.svg" } : undefined}
          align="end"
          className="min-w-0 shrink"
          onCopied={onCopied}
        />)}
    </div>
  </>;
}
